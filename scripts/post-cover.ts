/**
 * Posts a small amount of the manager's own first-loss cover, so `npm run smoke:live` has a
 * real ledger change to watch arrive on screen. Additive and low-stakes: `CoverAvailable`
 * only goes up, no investor position moves, and the manager can withdraw it again.
 */
import { getClient, disconnectClient } from '../src/protocol/lib/client.js'
import { loadWallets } from '../src/protocol/lib/env.js'
import { loadState } from '../src/protocol/lib/state.js'
import { depositCover } from '../src/protocol/flows/broker.js'

const units = Number(process.argv[2] ?? 1)

const client = await getClient()
const wallets = loadWallets()
const state = loadState()
if (!state.loanBrokerId || !state.mptIssuanceId) throw new Error('no broker/issuance in state.json — run `npm run demo setup`')

await depositCover(client, wallets.manager, state.loanBrokerId, state.mptIssuanceId, units)
console.log(`posted ${units} unit(s) of cover`)
await disconnectClient()
