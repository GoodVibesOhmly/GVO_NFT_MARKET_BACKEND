import type { Observable } from "rxjs"
import { defer } from "rxjs"
import { first, mergeMap, startWith } from "rxjs/operators"
import type { WalletLink, WalletLinkOptions } from "walletlink/dist/WalletLink"
import type { WalletLinkProvider } from "walletlink/dist/provider/WalletLinkProvider"
import type { Maybe } from "../../common/utils"
import { cache } from "../../common/utils"
import { AbstractConnectionProvider } from "../../provider"
import type { ConnectionState } from "../../connection-state"
import { getStateConnecting } from "../../connection-state"
import { connectToWeb3, getJsonRpcWalletInfoProvider } from "./common/web3connection"
import type { EthereumProviderConnectionResult } from "./domain"

export type WalletLinkConfig = {
	url: string
	networkId: number
	estimationUrl: string
}

const PROVIDER_ID = "walletlink" as const

export class WalletLinkConnectionProvider extends
	AbstractConnectionProvider<typeof PROVIDER_ID, EthereumProviderConnectionResult> {
	private readonly instance: Observable<{walletLink: WalletLink, walletLinkWeb3Provider: WalletLinkProvider}>
	private readonly connection: Observable<ConnectionState<EthereumProviderConnectionResult>>

	constructor(
		private readonly config: WalletLinkConfig,
		private readonly walletLinkOptions: WalletLinkOptions
	) {
		super()
		this.instance = cache(() => this._connect())
		this.connection = defer(() => this.instance.pipe(
			mergeMap(instance => {
				const web3like = instance.walletLinkWeb3Provider
				return connectToWeb3(
					getJsonRpcWalletInfoProvider(web3like),
					instance,
					web3like,
					{
						disconnect: async () => await instance.walletLink.disconnect(),
					}
				)
			}),
			startWith(getStateConnecting({ providerId: PROVIDER_ID })),
		))
	}

	private async _connect(): Promise<{walletLink: WalletLink, walletLinkWeb3Provider: WalletLinkProvider}> {
		const { default: WalletLink } = await import("walletlink")
		const walletLink = new WalletLink(this.walletLinkOptions)
		const walletLinkWeb3Provider = walletLink.makeWeb3Provider(this.config.url, this.config.networkId)
		await walletLinkWeb3Provider.enable()
		return { walletLink, walletLinkWeb3Provider }
	}

	getId(): string {
		return PROVIDER_ID
	}

	getConnection() {
		return this.connection
	}

	getOption(): Promise<Maybe<typeof PROVIDER_ID>> {
		return Promise.resolve(PROVIDER_ID)
	}

	async isAutoConnected(): Promise<boolean> {
		return false
	}

	async isConnected(): Promise<boolean> {
		return (await this.instance.pipe(first()).toPromise()).walletLinkWeb3Provider.isConnected()
	}
}
