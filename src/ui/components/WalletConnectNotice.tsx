import { Panel } from './Panel'
import { WALLETCONNECT_ENABLED } from '../wallet/config'

/**
 * The XRPL Dev Wallet extension is reachable only over WalletConnect, and the
 * WalletConnect adapter needs a project id. Without one the wallet is silently missing
 * from the connect modal, which reads as "my wallet is unsupported" rather than
 * "a build-time variable is unset". Say which it is.
 */
export function WalletConnectNotice() {
  if (WALLETCONNECT_ENABLED) return null

  return (
    <Panel title="WalletConnect is off" tone="warn">
      <p className="text-sm">
        The <a href="https://github.com/oz-ross/xrpl-dev-wallet-extension" target="_blank" rel="noreferrer">XRPL
        Dev Wallet</a> extension injects nothing into the page — it pairs only over
        WalletConnect, so it cannot appear in the list until that adapter is enabled.
      </p>
      <ol className="m-0 mt-3 grid list-decimal gap-2 pl-5 text-sm">
        <li>
          Get a free project id at <code>cloud.walletconnect.com</code> (now Reown). The
          extension needs one too, in its own <code>.env</code> as <code>WC_PROJECT_ID</code>;
          the same id works for both.
        </li>
        <li>
          Put it in this project&rsquo;s <code>.env</code>:
          <br />
          <code>VITE_WALLETCONNECT_PROJECT_ID=your_id</code>
        </li>
        <li>
          Restart <code>npm run dev</code> &mdash; Vite only reads <code>.env</code> at startup.
        </li>
        <li>
          Pick <strong>WalletConnect</strong>, copy the <code>wc:</code> URI, and paste it into
          the extension popup&rsquo;s &ldquo;Paste wc:… URI from the dApp&rdquo; field.
        </li>
      </ol>
    </Panel>
  )
}
