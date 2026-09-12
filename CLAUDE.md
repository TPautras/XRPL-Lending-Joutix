# XRPL Closed-End Tokenized Credit Protocol

A bond on XRPL: a closed-ended vault whose shares are the tradable bond certificate, funding one
fixed-term interest-bearing loan that fully repays before the vault redeems. All logic is **native
XLS-65/66 transactions plus thin app code** — no custom contracts.

Full rationale, amendment matrix, field reference and unbuilt-phase designs: **`docs/SPEC.md`**.
Read it when you need the *why* or a phase you have not built yet; do not duplicate it here.

## Vault lifecycle — the spine of the demo

A closed-ended vault has two UInt32 Ripple-epoch dates that cut its life into three phases:

| Phase | Window | Allowed | Must be rejected |
|---|---|---|---|
| Subscription | → `SubscriptionDate` | `VaultDeposit` | — |
| Investment | `SubscriptionDate` → `RedemptionDate` | `LoanSet`, `LoanPay` | `VaultDeposit`, `VaultWithdraw` |
| Redemption | `RedemptionDate` → | `VaultWithdraw` | `LoanSet` |

- **Compress all dates to the event.** Minutes, not months — a full lifecycle has to run inside a
  demo. Convert with `unixTimeToRippleTime` / `isoTimeToRippleTime` from `xrpl` (both exported, and
  `rippleTimeToISOTime` back). Never hand-roll the 2000-01-01 epoch offset.
- **The loan must fully amortize before `RedemptionDate`:** `PaymentInterval × PaymentRemaining`
  from origination has to land strictly before it, or the vault redeems against an outstanding loan.
  Assert this before submitting `LoanSet`.

### Verified vs unverified (as of 2026-09-12, Devnet `rippled 3.4.0-rc5`)

- ✅ `SubscriptionDate` (UInt32, nth 75) and `RedemptionDate` (UInt32, nth 76) exist in Devnet
  `server_definitions` — they serialize and can be submitted.
- ⚠️ They are **undocumented**: absent from the XLS-65 README on `master` and from the xrpl.org
  `VaultCreate` reference. Which transaction carries them, and the exact reject semantics, come from
  the ledger, not from a spec page.
- ⚠️ **`VaultKind` gates everything** (confirmed by reading `5.2.0-beta.1`'s `validateVaultCreate`
  source, not yet confirmed against Devnet `rippled` itself — that check is still open): a
  `VaultKind` enum, `0` = open-ended / `1` = closed, undocumented in XLS-65 or xrpl.org, must be
  `1` before `SubscriptionDate`/`RedemptionDate` are accepted at all; setting either while
  `VaultKind !== 1` throws client-side. The SDK also enforces
  `180 ≤ RedemptionDate − SubscriptionDate < 946708560` seconds — a **3-minute floor** on the
  Investment phase, so "compress to minutes" has a hard lower bound. `VaultSet` carries neither
  date, so they read as immutable post-creation. None of this is on any spec page; see
  `docs/SEAMS.md`.
- ⚠️ **SDK footgun, version-dependent — check which is pinned before trusting this:** stable
  `xrpl@5.2.0`'s `VaultCreate` TypeScript interface declares only `Asset`, `Data`,
  `AssetsMaximum`, `MPTokenMetadata`, `WithdrawalPolicy`, `DomainID`, `Scale` — the dates are in
  `ripple-binary-codec` but not the type, so setting them needs a cast. The pinned
  `5.2.0-beta.1` (see Stack below) already types `VaultKind`/`SubscriptionDate`/`RedemptionDate`,
  so no cast is needed there — but re-verify against whatever version is actually installed
  before assuming either way.
- ⚠️ **No phase-specific result codes exist.** Devnet has no `tecVAULT_*`. Out-of-phase rejects will
  surface as something generic — `tecNO_PERMISSION`, `tecEXPIRED`, `tecTOO_SOON` and
  `tecINVALID_UPDATE_TIME` are the plausible candidates. **Do not guess in code or in the demo
  script.** Phase 0 probes the real codes and records them in this table.

| Rejected action | Phase | Actual code | Verified |
|---|---|---|---|
| `VaultDeposit` | Investment | TBD | ☐ |
| `VaultWithdraw` | Investment | TBD | ☐ |
| `LoanSet` | Redemption | TBD | ☐ |

## Stack

- TypeScript. Protocol layer in `src/protocol/` (one file per flow), demo UI in `src/ui/`
  (Vite + React + TS, client-only, talks to Devnet over websocket).
- `xrpl@5.2.0-beta.1` — **pinned, not stable `latest`**; verified to serialize `VaultCreate`,
  `VaultSet`, `VaultDeposit`, `VaultWithdraw`, `LoanBrokerSet`, `LoanSet`, `LoanPay`,
  `LoanManage`, `CredentialCreate`, `PermissionedDomainSet`, `VaultClawback`. Do not bump
  without re-checking those types *and* the date-field gap above. History:
  - Stable `5.2.0`'s `VaultCreate` type has **no** `SubscriptionDate`/`RedemptionDate`/
    `VaultKind` at all — the "needs an `as any` cast" footgun below described that version.
  - `5.2.0-beta.0` adds all three, plus a `VaultKind` enum (`0` open, `1` closed) that
    **gates** the dates: `validateVaultCreate` rejects them unless `VaultKind: 1`, and enforces
    `180 ≤ RedemptionDate − SubscriptionDate < 946708560` seconds. `VaultSet` carries neither
    date, so they read as immutable after creation. None of this is documented anywhere but the
    beta's own validator source — see `docs/SEAMS.md`.
  - `5.2.0-beta.1`: the vault/lending transaction models are **byte-identical** to `beta.0`
    (diffed both tarballs in full — zero changes anywhere under
    `dist/npm/models/transactions/`). The only functional change in the whole package is to
    `Wallet/{sponsorSigner,counterpartySigner,utils}`: sponsor- and counterparty-signed
    transactions now use distinct `fixCleanup3_4_0` signing prefixes
    (`encodeForSigningSponsor`/`encodeForSigningCounterparty`) instead of reusing the plain
    transaction prefix. Relevant if the sponsored-fees-and-reserves coupling (see Event
    requirement below) gets built — `beta.0`'s sponsor signatures may not validate against a
    `rippled` enforcing `fixCleanup3_4_0`.
- Run a protocol script: `npx tsx src/protocol/<name>.ts`. UI: `npm run dev`.
- Vite + React 19 is scaffolded; `package.json` scripts are `dev`, `build`, `preview`,
  `typecheck`, plus per-flow `tsx` invocations.
- Wallet connection uses `xrpl-connect@0.8.2` (XRPL Commons), pinned exact. It ships **no type
  declarations** — `src/ui/wallet/xrpl-connect.d.ts` is hand-written from the bundle's export
  list and must be re-checked on any upgrade. Do **not** switch to
  `@xrpl-commons/xrpl-connect-react`: it peer-requires `xrpl ^3 || ^4`, which conflicts with the
  `xrpl@5.2.0-beta.1` pin above. See `docs/SEAMS.md`.

## Environment

- Network: Devnet `wss://s.devnet.rippletest.net:51233` (`rippled 3.4.0-rc5`, `SingleAssetVault` +
  `LendingProtocol` enabled). If it resets or lags, switch to the Lending-Devnet faucet on
  `xrpl.org/resources/dev-tools/xrp-faucets`.
- Accounts: fund once from the faucet, persist seeds in `.env` (gitignored), reuse across runs so
  vault/loan objects survive between sessions. Track created object IDs (`VaultID`, `LoanBrokerID`,
  `LoanID`, `ShareMPTID`) alongside them — scripts read them instead of re-deriving.
- Roles to provision: issuer (stablecoin + credentials), broker, borrower, 2+ investors.
- Vault asset: a demo stablecoin you issue yourself (IOU or MPT), not raw XRP.
- Re-verify amendments and field availability with `server_definitions` / `feature` before building.
  Devnet sets change; this file records a snapshot, not a guarantee.

## Design invariants

- **One Vault + one LoanBroker per Loan.** Each share is a direct claim on one specific debt,
  priceable on a secondary market. Pooled multi-loan vaults are a stretch goal only.
- Reject deposits once `AssetsTotal == AssetsMaximum` — the cap is what makes it closed-end; the
  dates are what make it closed-*ended*. Both must hold.
- Interest reaches lenders as `AssetsTotal` growth (share appreciation), never as a separate payout.

## Event requirement: coupling + seam report

The lending stack must be **coupled with at least one other ledger primitive**, and the seams
reported: Permissioned Domains + Credentials, TokenEscrow, sponsored fees and reserves, MPTs.

Keep a running **`docs/SEAMS.md`**. Every time two primitives meet, append a short entry: what you
wired together, what broke or surprised you, what the ledger made awkward, what you worked around.
Write it **as you hit it**, not reconstructed at the end — the friction is the deliverable, and the
detail is gone by the demo. Phase 2 (Credentials + PermissionedDomain gating a private vault) is the
default coupling and already in scope; MPT share trading in Phase 3 is a second seam for free.

## Phases

Build in order; each phase must hit its definition of done before the next starts.

| # | Phase | DoD | Status |
|---|---|---|---|
| 0 | Env + lifecycle probe: connect, verify amendments, fund accounts, issue stablecoin, then create a throwaway vault with compressed dates and attempt each out-of-phase action | the three reject codes above are filled in and ticked, from real ledger responses | todo |
| 1 | **Minimum bar** (see below) | all six steps run end to end on Devnet inside one demo window | todo |
| 2 | Compliance coupling: `CredentialCreate` + `PermissionedDomainSet`, vault private | an uncredentialed `VaultDeposit` **fails**; seam entry written | todo |
| 3 | Secondary market: share MPT on order book (XLS-82) + AMM pool vs the stablecoin | a share MPT moves between two test accounts via a real ledger tx, not a mock | todo |
| 4 | Early close-out: full-payoff `LoanPay` | payoff applies `CloseInterestRate`/`ClosePaymentFee` and closes the loan | todo |

### Phase 1 — minimum bar, verbatim

1. Create a closed-ended vault, dates compressed to the event.
2. Deposit capital during the Subscription phase.
3. In Investment, originate and fund a loan whose final payment falls before `RedemptionDate`.
4. In Redemption, withdraw capital plus accrued yield.
5. Show a rejected `VaultDeposit` **and** `VaultWithdraw` during Investment.
6. Show a rejected `LoanSet` during Redemption.

Steps 5 and 6 are demo output, not just tests: print the transaction, the phase, and the actual
engine result code. Withdrawn amount in step 4 must visibly exceed the deposit — that spread is the
whole thesis.

Phases 5–6 (debt novation or wrapped debt token; pooled vault, PermissionedDEX, TokenEscrow) are
**deferred — not in scope until explicitly chosen.** Designs are in `docs/SPEC.md` §5.3.

Update the Status column and the reject-code table as work lands.

## Rules

- Pull XLS-65/66 specs fresh from `XRPLF/XRPL-Standards@master` at build time — both are `status:
  Draft` and get patched, and as shown above the ledger is already ahead of them. When the two
  disagree, **the ledger wins**; record the divergence in `docs/SEAMS.md`.
- Take the early-close interest formula from XLS-66 Appendix A-3; never hardcode a guessed formula.
- Check every transaction result for `tesSUCCESS` and surface the raw engine result code on failure.
  For these new tx types the code is the fastest debugging signal — never swallow it.
- Amounts: respect vault `Scale` and MPT precision. Never do float math on ledger amounts.
- **Do not build:** Hooks/WASM contracts, cross-chain anything, an on-chain collateral liquidation
  engine (XLS-66 is intentionally uncollateralized / off-chain-underwritten).
- **Do not overstate debt trading.** Early repayment ≠ third-party debt purchase. Only claim debt
  trading if a `docs/SPEC.md` §5.3 approach is actually implemented.
