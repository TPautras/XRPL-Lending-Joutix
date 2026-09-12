# TrustFlow — invoice factoring + credit insurance on XRPL

**Hackathon:** XRPL Lending Protocol — DeVinci Blockchain × Ripple, Nanterre, 2026-09-12/13.
**Track:** 1 (open-ended vault, Lending Protocol V1) · **Flavour:** Loaded
**Environment:** Custom Hackathon Devnet (`rippled 3.4.0-rc1`, network_id `4001`)
**Library:** `xrpl@5.2.0` (stable)

An SME ships, invoices, and waits 60–90 days to get paid. TrustFlow pays it immediately:
investors pool capital in a shared reserve, a manager selects which invoices to fund by
putting their own money first-loss, and an insurer covers default risk on a given loan.
Every step — deposit, loan, repayment, default, payout — is native XLS-65 (Single Asset
Vault) + XLS-66 (Lending Protocol), coupled with Credentials, a Permissioned Domain, and
a TokenEscrow-based credit-insurance overlay. No custom contracts.

Full design rationale, the roles, and the build plan live in [`CLAUDE.md`](./CLAUDE.md).

## Status

| Phase | What | State |
|---|---|---|
| 0 — probe | Confirm amendments live, fund accounts, issue the demo stablecoin | ✅ verified against the live devnet (`npm run probe`) |
| 1 — minimum bar | Reserve → deposit → loan → repayment → withdrawal, plus one rejected guardrail tx | ✅ verified end to end, real tx hashes below |
| 2 — the gate | Credential-gated vault; an uncredentialed account is refused | ✅ verified against the live devnet — `s8` and the full four-state proof (`npm run demo gate`), tx hashes below |
| 3 — the twist | Credit insurance via TokenEscrow (`s5`, `s9`, `prestage`) | ✅ verified end to end against the live devnet, tx hashes below |

Two real bugs surfaced and were fixed while verifying Phase 1 — both are ledger/spec behavior, not
typos, and are detailed in `docs/FRICTION.md` and `FEEDBACK_REPORT.md`:

1. `LoanSet`'s `PrincipalRequested` field disburses **raw base units**, not display-scaled units —
   passing the real EUR magnitude directly put 100x too little TFEUR in the borrower's account.
2. `LoanPay` with `tfLoanFullPayment` returns `tecKILLED` when `Loan.PaymentRemaining == 1` — the
   last installment of any loan must be paid as a regular payment instead (XLS-66 §3.11.2).

### Verified transactions (Phase 1 run, 2026-09-12)

All from the live Custom Hackathon Devnet — `<hash>` resolves at
`https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/<hash>`.

| Step | Transaction | Result | Hash |
|---|---|---|---|
| `setup` | `VaultCreate` | `tesSUCCESS` | `FF8DBC4548F051B1D76F9D20AA749A166D9AED8AFB38509BDB344F1F783EAE87` |
| `setup` | `LoanBrokerSet` | `tesSUCCESS` | `B952C9D3A85878B86DFA9421B0A0B8E04BF78177C502C1AE5110788096138F49` |
| `s4` | `LoanSet` (dual-signed) | `tesSUCCESS` | `C7B2620D41A46094A60A2E53527808CDE0C31F1A3A18D7AD0DE22A0F3C1CAAF2` |
| `s6` | `LoanPay` (full repayment) | `tesSUCCESS` | `B1F6E04DDCF1819656273A6414B2453C88F79844D027A1E3EB6B0D35E008DF08` |
| `s7` | `VaultWithdraw` (deliberate over-withdraw) | `tecINSUFFICIENT_FUNDS` (expected) | `11C963A77DA075B56D0752DF5C23999F5E3C4B7418D3C6E0EE69B3FF5E55A6E3` |
| `s10` | `VaultWithdraw` | `tesSUCCESS` | `329502AA4C885AD67DA28F3F468B984A7ED3F186AC91B120D5464D482B1798C3` |

### Verified transactions (Phase 2 — the gate, 2026-09-12)

One account (`rDyibrtuGLxhscYJ59fpV3Tq2JzZb2WZ7G`) walked through every credential state against
the private vault `8B3F561021ED…CE7261`. Reproduce with `npm run demo gate`; the run below is the
second of two that produced identical results.

| Credential state | Transaction | Result | Hash |
|---|---|---|---|
| none | `VaultDeposit` | `tecNO_AUTH` | `B0EF83FE333241766DF49BE93CF88F739E6ADC91177ED70855FA38A636DD4774` |
| none | `LoanSet` (borrow side) | `tesSUCCESS` ⚠️ | `DD77E5807DC4D052530238268687EB33BA812504C860A26794088565FE5EC1E2` |
| issued, **not accepted** | `VaultDeposit` | `tecNO_AUTH` | `401575D50300DD9DB42C1A8F5C0B5EBD5105D7E44855A01919DE7C9AC6D8FB4D` |
| accepted | `VaultDeposit` | `tesSUCCESS` | `F630C1CF269DD2E5D416A678440BC54D8186C0E8161B7B655D8C5C3B3FAB2A53` |
| revoked | `VaultDeposit` | `tecNO_AUTH` | `8E1B2240CDBD0C70AD445CF12FB5FEA183551B943B53F6ECA67A382251FF7EE2` |
| revoked | `VaultWithdraw` | `tesSUCCESS` | `58DCF5361D030D7142102889D94DC732FD3D52B63EDB6060F18706DB7C603B38` |

Three things this table establishes, each on-ledger rather than asserted in code:

1. **An issued-but-unaccepted credential grants nothing.** The `Credential` object exists and the
   holder is still refused, exactly as if it did not — `CredentialAccept` is not optional
   bookkeeping. This is the easiest way to build a gate that silently refuses everyone.
2. **Revocation closes the door without trapping anyone.** Refused in, served out. XLS-65 §7 makes
   this a ledger guarantee, so it is a property of the protocol, not of our code.
3. ⚠️ **The gate does not extend to borrowing.** `LoanSet` succeeded for the account the same vault
   refused in the immediately preceding transaction. See the gaps section below and
   `FEEDBACK_REPORT.md` §2.

The on-stage step `s8` is the short version of the same thing:

| Step | Transaction | Result | Hash |
|---|---|---|---|
| `s8` | `VaultDeposit` by a **funded** uncredentialed account | `tecNO_AUTH` (expected) | `A7F1DEB1ADF4FD7A912AA5114F14E9553537573C2DE0168058CCCF4F820E3D27` |
| `s8` | `CredentialDelete` (investor's credential revoked) | `tesSUCCESS` | `C02CFE069D225C5E0554D8AB1B0680CFD0E089116FB404A641E4DA5D71337489` |
| `s8` | `VaultDeposit` after revocation | `tecNO_AUTH` (expected) | `037C701A3B549B7D5EA7573E706B643E3C6DDF4FEDC06002CCBF1DA4511C5165` |
| `s8` | `VaultWithdraw` after revocation — **still works** | `tesSUCCESS` | `AE48D99C42BF9D9F7F4A8BD4CEAD4BC748665070B98529B5B9AB2C92DD7F0359` |

### Verified transactions (Phase 3 — the twist, 2026-09-12)

`prestage` sells protection on Loan B; `s5` pays a premium; once Loan B's grace period lapses, `s9`
impairs and defaults it and the manager (the referee holding the crypto-condition fulfillment)
releases the escrow to the protection buyer.

| Step | Transaction | Result | Hash |
|---|---|---|---|
| `prestage` | `EscrowCreate` (insurer locks covered amount) | `tesSUCCESS` | `8176143DD6D6F34FD90D7CA291E2DB1A4B34217B7F98574F6EC9FF24F7C1F8BD` |
| `s5` | `Payment` (premium, buyer → insurer) | `tesSUCCESS` | `F893A293EDAD84B2061F26CD49B104F1DB9DB5890C48FEB335A43BADE3D4DE6F` |
| `s9` | `LoanManage` (`tfLoanImpair`) | `tesSUCCESS` | `807EE4DF021A59A4555D1FD1CC76C081DD7164C9ED54CBF0E510CD911334EEF5` |
| `s9` | `LoanManage` (`tfLoanDefault`) | `tesSUCCESS` | `4F8324E976FCCDDA18D629446E4E53FBFC619A34C9176257AA38C62FE47A7536` |
| `s9` | `EscrowFinish` (manager reveals fulfillment) | `tesSUCCESS` | `8C6658F773FAC83F3F0A6D869E8098D9729954DAD7E7919CB10C348D39DD7F1E` |

One real bug surfaced rehearsing this phase, detailed in `docs/FRICTION.md`:
`five-bells-condition`'s `PreimageSha256` constructor silently ignores a `{ preimage }` options
object (the base `Fulfillment` constructor takes none) — the preimage must be set via
`f.setPreimage(preimage)` after construction, or `getConditionBinary()`/`serializeBinary()` throw
`MissingDataError` later, decoupled from the actual mistake.

A second, non-protocol issue surfaced immediately after: `s10`'s hardcoded withdrawal amounts
assumed the share price stays at or above 1. Loan B's default was only partly absorbed by the
manager's cushion, so the share price dropped below 1 and re-requesting the original deposit face
value overdrew the investors' actual entitlement (`tecINSUFFICIENT_FUNDS`). Fixed by
`flows/vault.ts`'s new `withdrawMax()`, which redeems exactly what the caller's shares are worth
right now instead of a fixed amount.

## Roles

| Role | Does |
|---|---|
| Investor (A, B) | Deposits into the shared reserve, gets a share back |
| Manager (broker) | Picks which invoices to fund; posts first-loss capital before lending |
| SME (borrower) | Borrows against an invoice, repays on schedule |
| Insurer | Sells default protection on a specific loan via a TokenEscrow |
| Authority | Issues the compliance credential that gates the reserve |

## Setup

```bash
npm install
cp .env.example .env
npm run probe   # confirms the required amendments are live, funds any missing/low account
npm run demo setup
npm run demo prestage   # ~5 min before you plan to run the live steps
npm run demo s1
npm run demo s2
# ... through s10
npm run demo verify
```

`npm run demo gate` runs the Phase 2 evidence pass on its own: it walks one account through every
credential state (none → issued-not-accepted → accepted → revoked), records what the ledger answers
at each, probes the borrow side, and prints the access matrix reproduced above. It is idempotent —
it resets the account to uncredentialed and tops up the balances and vault liquidity it needs — so
it can be re-run for a second confirmation at any time.

`npm run dev` starts a read-only dashboard (share price, cushion, loan status, insurance
state, live tx feed) driven purely by ledger queries against the hackathon devnet — it
never signs anything; every transaction above is signed by the protocol scripts using the
seeds in `.env`.

`npm run demo full` runs `setup` + `prestage` + every step end to end, including the real
wall-clock wait for Loan B to become defaultable — useful for a full rehearsal, not for
the actual stage run (see `CLAUDE.md`'s stage-timing note).

## Transactions used

| Transaction | Where |
|---|---|
| `MPTokenIssuanceCreate`, `MPTokenAuthorize`, `Payment` | `flows/stablecoin.ts` — the demo TFEUR stablecoin |
| `CredentialCreate`, `CredentialAccept`, `CredentialDelete` | `flows/credentials.ts` — the compliance gate, issuance and revocation |
| `PermissionedDomainSet` | `flows/domain.ts` |
| `VaultCreate`, `VaultDeposit`, `VaultWithdraw` | `flows/vault.ts` — the shared reserve |
| `LoanBrokerSet`, `LoanBrokerCoverDeposit` | `flows/broker.ts` — the manager's first-loss cushion |
| `LoanSet` (dual-signed), `LoanPay`, `LoanManage` | `flows/loan.ts` — origination, repayment, impairment, default |
| `EscrowCreate`, `EscrowFinish`, `EscrowCancel` | `flows/insurance.ts` — the credit-insurance overlay |

Every run prints each transaction's engine result code and an explorer link
(`https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/<hash>`).

## How it works

```
src/protocol/
  lib/        connection, wallets, signing/submit helpers, MPT scaling, state I/O
  flows/      one file per on-ledger primitive — stablecoin, domain, credentials,
              vault, broker, loan, insurance, rejections, gate, report
  demo.ts     the step runner (see below)
  probe.ts    Phase 0 — checks amendments, funds/prints missing account seeds
```

**`state/hackathon.json` is the single source of truth for the demo's own bookkeeping** — the
object IDs (`vaultId`, `loanBrokerId`, loan IDs, the insurance escrow's condition/fulfillment,
the MPT issuance ID) that only exist *after* a transaction creates them on-ledger. Every `flows/*`
function is idempotent against it: it checks `state` first and returns the existing object instead
of re-submitting (e.g. `createVault()` won't create a second vault on a re-run). `saveState()`
mirrors the same file to `public/state.json` so the browser dashboard can read it — Vite can't
statically import a file that doesn't exist yet at build time, so the dashboard polls it instead.

**`demo.ts` is a thin CLI over `flows/*`**, one subcommand per step (`setup`, `prestage`, `s1`..`s10`,
`gate`, `full`, `verify`, `reset`) matching `CLAUDE.md`'s demo script numbering 1:1 — see the cue sheet
below for what each step does. `reset` only wipes the local state file; it never touches the ledger,
so a fresh `setup` after a `reset` creates brand-new on-chain objects rather than reusing old ones.

**Every submitted transaction goes through `lib/submit.ts`'s `submit()`/`submitBlob()`**, which
autofills, signs, waits for validation, and throws unless the engine result matches what was
expected (`tesSUCCESS` by default, or an explicit code passed via `opts.expect` for the deliberate
rejections in `flows/rejections.ts`). This is what makes every run print a `✓`/`✗` line with the
raw engine result code and an explorer link — per `CLAUDE.md`'s rule to never swallow a mismatched
result silently.

There is exactly one opt-in exception, `submit(..., { record: true })`, used only by the gate probes
in `flows/gate.ts`: there we genuinely do not know what the ledger will answer — that *is* the
experiment — so the result is returned instead of asserted. It still prints its raw engine code and
explorer link (marked `·` rather than `✓`/`✗`), so nothing is swallowed, only un-asserted. Never
reach for it to quiet a failing transaction.

**Amount handling (`lib/mpt.ts`) is the sharpest edge in this codebase** — see the Status section
above and `docs/FRICTION.md` for the two bugs this produced. Two different conventions coexist on
purpose:
- `MPTAmount` fields (`VaultDeposit`/`VaultWithdraw`/`LoanPay`'s `Amount`, `Payment`, `EscrowCreate`)
  are always **base units** — `mptAmount()`/`mptBaseUnits()` convert a real EUR magnitude by
  `10^TFEUR_SCALE` before it goes on the wire.
- Loan "Number" fields (`PrincipalRequested`/`PrincipalOutstanding`/`TotalValueOutstanding`/
  `PeriodicPayment`) are self-describing decimals that, empirically, **also** turn out to be
  base-unit denominated for an MPT-funded loan — so `flows/loan.ts` scales `PrincipalRequested` on
  the way in but does *not* re-scale `TotalValueOutstanding`/`PeriodicPayment` on the way out.

**The dashboard (`src/ui/dashboard/`) is read-only by construction** — `useDashboard.ts` only ever
calls `client.request()` (never signs or submits), polling `public/state.json` for object IDs and
subscribing to `ledgerClosed` for live refreshes. It's driven entirely by what the protocol scripts
already wrote to disk, so it can safely run alongside a live demo without any risk of it firing a
transaction by accident.

**Friction logging (`lib/friction.ts`)** appends timestamped entries to `docs/FRICTION.md`
automatically from the rejection flows, the gate probes (`flows/gate.ts` logs whichever way the
borrow-side experiment comes out, and would log a stranded-withdrawal too), and a couple of
self-checks (e.g. the `PrincipalRequested` scale check in `originate()`) — manual entries use the
same format for anything hit outside the scripts (docs, tooling, faucet).

## Demo cue sheet

`✅` = run against the live devnet and confirmed (see the verified-transactions table above).
`⚙️` = implemented, not yet exercised end to end.

1. ✅ `s1` — authority issues credentials to every legitimate participant.
2. ✅ `s2` — both investors deposit into the reserve.
3. ✅ `s3` — manager tops up the first-loss cushion.
4. ✅ `s4` — SME originates Loan A (dual-signed); funds move immediately.
5. ⚙️ `s5` — investor pays the insurance premium (protection on Loan B was pre-staged).
6. ✅ `s6` — SME repays Loan A in full; share price rises.
7. ✅ `s7` — an over-withdraw is rejected by the protocol (`tecINSUFFICIENT_FUNDS`).
8. ✅ `s8` — two beats. An uncredentialed account, **visibly holding more TFEUR than it is trying
   to deposit**, is refused (`tecNO_AUTH`) — so the refusal is unambiguously about the credential
   and not the balance. Then an investor's credential is revoked: the same account is refused on
   the way *in* and still served on the way *out* (`VaultWithdraw` → `tesSUCCESS`). That asymmetry
   is TrustFlow's headline compliance choice and a ledger-level guarantee (XLS-65 §7), not our own
   leniency — say so on stage.
9. ⚙️ `s9` — Loan B (pre-staged, now overdue) is impaired, then defaulted; the manager's
   cushion absorbs the loss first; the insurance escrow pays out to the protected investor.
10. ✅ `s10` — investors withdraw capital plus yield.

## Known spec/implementation gaps (see `FEEDBACK_REPORT.md` for detail)

- Credit insurance cannot be triggered by ledger state directly — TokenEscrow only
  releases on time or a crypto-condition, so a trusted party must observe the default
  and reveal the fulfillment. No trustless credit derivative is buildable on XRPL today.
- `LoanSet` pays the borrower directly; there is no separate drawdown transaction, though
  the hackathon brief's own wording still implies one.
- XLS-66 has no `LoanTransfer` transaction — a `Loan` stays permanently tied to the
  Broker+Borrower pair that created it.
- **A private vault gates deposits but not loans.** `LoanSet` never consults the vault's
  `PermissionedDomain`, so an account the vault refuses a `VaultDeposit` from (`tecNO_AUTH`) can
  still be handed that vault's assets as a loan. Reproduced on two independent runs by
  `npm run demo gate`. Not an exploit — `LoanSet` is dual-signed, so the broker must still
  counter-sign — but with a domain configured, an uncredentialed borrower is stopped by the
  broker's off-ledger discretion alone.
