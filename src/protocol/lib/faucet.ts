import { NETWORK } from './env.js'

export interface FaucetAccount {
  address: string
  secret: string
  balance: number
}

/**
 * The Custom Hackathon Devnet faucet does not implement the faucet contract xrpl.js
 * expects: `Client.fundWallet()` reads `body.account.classicAddress`, but this
 * faucet's response only ever has `body.account.address` — so `fundWallet()` always
 * throws `XRPLFaucetError: The faucet account is undefined`, even on a successful
 * funding. Confirmed separately: it also ignores any `destination`/`address` field in
 * the POST body and always mints a brand-new random account — there is no way to top
 * up an existing address through this faucet. Call it directly instead of going
 * through `Client.fundWallet()`.
 */
export async function requestFaucetAccount(): Promise<FaucetAccount> {
  const response = await fetch(`https://${NETWORK.faucetHost}${NETWORK.faucetPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!response.ok) {
    throw new Error(`Faucet request failed: ${response.status} ${await response.text()}`)
  }
  // Two known response shapes: this hackathon devnet's faucet nests `account.secret`, while
  // the public rippletest.net faucet puts the seed top-level as `seed` and never sets
  // `account.secret` at all — read whichever is present instead of assuming one shape.
  const body = (await response.json()) as {
    account: { address: string; secret?: string }
    seed?: string
    balance?: number
    amount?: number
  }
  const secret = body.account.secret ?? body.seed
  if (!secret) throw new Error(`Faucet response had no secret/seed: ${JSON.stringify(body)}`)
  return { address: body.account.address, secret, balance: body.balance ?? body.amount ?? 0 }
}
