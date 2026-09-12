import { randomBytes } from 'node:crypto'
import { PreimageSha256 } from 'five-bells-condition'

export interface CryptoCondition {
  condition: string
  fulfillment: string
}

/** The credit-insurance escrow's trigger: a PREIMAGE-SHA-256 crypto-condition. The
 * "referee" (manager) is whoever holds `fulfillment` — see CLAUDE.md's "the wall":
 * TokenEscrow can't read ledger state, so a trusted party must hold this secret and
 * decide when to reveal it via EscrowFinish. */
export function newCondition(): CryptoCondition {
  const preimage = randomBytes(32)
  const f = new PreimageSha256()
  // The constructor takes no options — five-bells-condition ships no types, and its own
  // JS constructor (Fulfillment's) ignores a `{ preimage }` passed there, so the object
  // silently ends up with no preimage set at all until this call. See docs/FRICTION.md.
  f.setPreimage(preimage)
  return {
    condition: f.getConditionBinary().toString('hex').toUpperCase(),
    fulfillment: f.serializeBinary().toString('hex').toUpperCase(),
  }
}
