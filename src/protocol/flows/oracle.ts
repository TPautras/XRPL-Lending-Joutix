import type { Client, Wallet } from 'xrpl'
import { submit } from '../lib/submit.js'
import { loadState, saveState } from '../lib/state.js'

/** TrustFlow only ever needs one price feed — the manager's valuation of the
 * receivable currently financed — so a single, fixed document id is enough; a
 * multi-invoice version would key this per loan slot instead. */
const RECEIVABLE_ORACLE_DOCUMENT_ID = 1

export interface ReceivablePrice {
  /** The funding asset's currency code (e.g. `'TFEUR'`), standing in for the
   * invoice denominated in it — XLS-47 prices an asset pair, not a `Loan` object,
   * so there is no field here for a specific loan or invoice id. */
  baseAsset: string
  /** What the receivable's value is quoted against, e.g. `'XRP'`. */
  quoteAsset: string
  /** Real magnitude, e.g. `0.5` for "1 TFEUR unit is worth 0.5 XRP". */
  price: number
  /** Decimal places `price` is expressed to; mirrors `PriceData.Scale` (XLS-47
   * caps this at 10). */
  scale: number
}

/** Publishes (or replaces — `OracleSet` on an existing `OracleDocumentID` updates
 * it in place) the manager's on-ledger valuation of the receivable behind the loan
 * currently being financed, as an XLS-47 Price Oracle.
 *
 * Scope, stated plainly so this is not overclaimed: XLS-66's `LoanSet`/`LoanManage`
 * take no `OracleDocumentID` and consult no `Oracle` object — nothing here feeds
 * back into loan-to-value checks or the broker's cover math. This is a standalone,
 * publicly-readable valuation of the receivable, exactly as informational as the
 * "Optional, time-permitting" line in CLAUDE.md's architecture table says it is.
 *
 * `LastUpdateTime` breaks the convention every other timestamp in this codebase
 * follows: `Loan.NextPaymentDueDate`, `GracePeriod` and the ledger's own
 * `close_time` are all Ripple-epoch seconds (`lib/time.ts`), but XLS-47 specifies
 * `OracleSet.LastUpdateTime` in Unix time — seconds since 1970, not since the
 * Ripple epoch (2000-01-01). Reusing `rippleNow()` here would silently write a
 * timestamp ~30 years in the past. Not exercised against the live devnet from
 * this machine (no local `.env`/seeds in this session) — verify the sign of that
 * gap the first time this runs for real, and log it to `docs/FRICTION.md` if the
 * ledger disagrees. */
export async function publishReceivablePrice(
  client: Client,
  manager: Wallet,
  quote: ReceivablePrice,
  documentId: number = RECEIVABLE_ORACLE_DOCUMENT_ID,
) {
  const assetPrice = Math.round(quote.price * 10 ** quote.scale)
  const tx: Record<string, unknown> = {
    TransactionType: 'OracleSet',
    OracleDocumentID: documentId,
    Provider: 'TrustFlow-manager',
    AssetClass: 'receivable',
    LastUpdateTime: Math.floor(Date.now() / 1000), // Unix time, not Ripple epoch -- see note above
    PriceDataSeries: [
      {
        PriceData: {
          BaseAsset: quote.baseAsset,
          QuoteAsset: quote.quoteAsset,
          AssetPrice: String(assetPrice),
          Scale: quote.scale,
        },
      },
    ],
  }

  const result = await submit(client, manager, tx)

  const state = loadState()
  state.oracle = {
    documentId,
    account: manager.classicAddress,
    baseAsset: quote.baseAsset,
    quoteAsset: quote.quoteAsset,
  }
  saveState(state)
  return result
}

/** `OracleDelete` — the manager withdrawing its valuation. Broker owner or not,
 * only the `Account` that created the `Oracle` object may delete it (XLS-47). */
export async function deleteReceivablePrice(
  client: Client,
  manager: Wallet,
  documentId: number = RECEIVABLE_ORACLE_DOCUMENT_ID,
) {
  return submit(client, manager, { TransactionType: 'OracleDelete', OracleDocumentID: documentId })
}
