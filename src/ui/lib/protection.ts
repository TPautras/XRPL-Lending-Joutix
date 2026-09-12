import { LedgerEntry, type Client } from 'xrpl'
import type { AppState } from './appState'
import { useLedgerQuery, type LedgerQuery } from './ledger'

export type ProtectionPhase =
  /** No protection sold yet — `prestage` has not run. */
  | 'none'
  /** The Escrow object is on the ledger: the insurer's cover is locked. */
  | 'locked'
  /** `EscrowFinish` landed — the covered amount went to the protection buyer. */
  | 'released'
  /** `EscrowCancel` landed after `CancelAfter` — the insurer reclaimed it and kept the premiums. */
  | 'expired'
  /** The object is gone and our state file says neither. Someone finished or cancelled it
   * outside the demo scripts, or the devnet reset — say so rather than guessing. */
  | 'settled elsewhere'

export interface ProtectionView {
  phase: ProtectionPhase
  /** Insurer: the Escrow's `Owner`, and the account `EscrowFinish`/`EscrowCancel` name. */
  owner: string | null
  /** The protection buyer, the Escrow's `Destination`. */
  destination: string | null
  /** Covered amount in base units, as recorded when the escrow was created. */
  amount: string | null
  condition: string | null
  cancelAfter: number | null
  /** True while the escrow object is still present on the ledger. */
  onLedger: boolean
}

const NONE: ProtectionView = {
  phase: 'none',
  owner: null,
  destination: null,
  amount: null,
  condition: null,
  cancelAfter: null,
  onLedger: false,
}

async function findEscrow(
  client: Client,
  owner: string,
  condition: string,
): Promise<LedgerEntry.Escrow | null> {
  const { result } = await client.request({ command: 'account_objects', account: owner, type: 'escrow' })
  return (
    result.account_objects.find(
      (object): object is LedgerEntry.Escrow =>
        object.LedgerEntryType === 'Escrow' && object.Condition === condition,
    ) ?? null
  )
}

/**
 * The credit-insurance escrow, checked against the ledger rather than trusted from the
 * state file. `released`/`cancelled` in `state.json` is what the demo scripts *did*; the
 * presence or absence of the Escrow object is what actually happened.
 */
export function useProtection(state: AppState | null): LedgerQuery<ProtectionView> {
  const insurance = state?.insurance
  const owner = insurance?.owner
  const condition = insurance?.condition

  return useLedgerQuery<ProtectionView>(
    !insurance || !owner || !condition
      ? async () => NONE
      : async (client) => {
          const escrow = await findEscrow(client, owner, condition)
          const phase: ProtectionPhase = escrow
            ? 'locked'
            : insurance.released
              ? 'released'
              : insurance.cancelled
                ? 'expired'
                : 'settled elsewhere'
          return {
            phase,
            owner,
            destination: insurance.destination ?? null,
            amount: insurance.amount ?? null,
            condition,
            cancelAfter: insurance.cancelAfter ?? null,
            onLedger: Boolean(escrow),
          }
        },
    [owner, condition, insurance?.released, insurance?.cancelled],
  )
}
