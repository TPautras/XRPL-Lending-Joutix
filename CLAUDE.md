# TrustFlow — Invoice Factoring + Credit Insurance on XRPL

**Hackathon: XRPL Lending Protocol — DeVinci Blockchain × Ripple, Nanterre, 2026-09-12/13.**
Track **1** (open-ended vault, Lending Protocol **V1**, Custom Hackathon Devnet) · Flavour **Loaded**.

An SME ships, invoices, and waits 60–90 days to get paid. TrustFlow pays it immediately: investors
pool capital in a shared reserve, a manager selects which invoices to fund by putting their own
money first-loss, and an insurer covers default risk on a given loan. Every step — deposit, loan,
repayment, default, payout — is native XLS-65/66 plus a thin coupling layer. No custom contracts.

This replaces an earlier Track 2 (closed-ended bond) direction; that work (`docs/SPEC.md`,
`docs/SEAMS.md`) has been deleted as abandoned. `src/ui`'s existing wallet-connection scaffold
(`xrpl-connect`, `WalletContext`, `AccountPanel`) is untouched and its reuse is still an open
decision — do not assume it fits TrustFlow's screens without checking.

## The four roles

| Role | Does | On-ledger primitive |
|---|---|---|
| Investor | Deposits into the shared reserve, gets a share back | `VaultDeposit`, vault shares (MPT) |
| Manager (broker) | Picks which invoices to fund; posts first-loss capital before lending | `LoanBrokerSet`, `LoanBrokerCoverDeposit` |
| SME (borrower) | Borrows against an invoice, repays on schedule | `LoanSet` (dual-signed with the broker), `LoanPay` |
| Insurer | Sells default protection on a specific loan, locks the covered amount, keeps premiums if the loan performs | TokenEscrow (see "the wall" below) |

Share value rises mechanically as the reserve collects interest — no manual distribution, the
appreciation is in the share price itself (`AssetsTotal` growth).

## The gate (compliance) — the core of "Loaded"

Every participant needs a `Credential` accepted by a `PermissionedDomain` before they can deposit,
borrow, or receive shares. **Withdrawal is deliberately left ungated**: an investor whose credential
expires must never be locked out of their own funds. Call this out explicitly in the demo — it is a
design choice, not an oversight.

## The twist and the wall: credit insurance

An investor buys protection against a specific borrower's default. The insurer locks the covered
amount on-ledger; the buyer pays periodic premiums. If the manager records an official default (a
visible, timestamped `LoanManage` action), the lock releases to the buyer. Otherwise it expires and
the insurer reclaims it and keeps the premiums. The protection contract can itself be represented as
a transferable token — a nascent secondary market for credit risk.

**Naming: call this "credit insurance" (assurance-crédit), never "CDS", in the pitch.** Same economic
object, but it's Coface/Allianz Trade's century-old business rather than a word that evokes 2008.
Keep the precise technical term in the written report only.

**The wall, and why it's the best finding of the project:** TokenEscrow can only release on a time
condition or a crypto-condition fulfillment — it cannot read another ledger object's state. There is
no native way for an escrow to ask "is this specific `Loan` in default?" and self-trigger. A trusted
third party must observe the default and submit the release. **Conclusion: a truly trustless credit
derivative is not currently buildable on XRPL.** This is exactly the kind of concrete, reproducible
gap that scores on the 40%-weighted feedback: name the primitive, name the transactions used, name
the exact point the protocol stops, name what's missing (a lock that can trigger on a ledger event),
and tie it to Ripple's own programmable-lock/sponsor-signing work in progress.

Already confirmed in this session's research (see `.xrpl-devex/reports/`): XLS-66 also has **no
`LoanTransfer`** transaction — a `Loan` stays permanently tied to the Broker+Borrower pair that
dual-signed it at creation. Any loan-level secondary market (this insurance token included) is an
off-protocol overlay, not a native reassignment.

## Two known spec/implementation gaps to log (and one bonus PR)

- **No separate drawdown step.** The current spec pays the borrower directly on `LoanSet`; the
  hackathon brief's own minimum-bar wording still implies a separate drawdown. Document this
  divergence — it's a ready-made documentation-fix PR (the simplest bonus contribution available).
- **Batch transactions are currently disabled** after a security issue. Don't build anything on top
  of them; do mention the absence as a legitimate, already-documented missing primitive.

## Architecture

| Primitive | Role in TrustFlow | Criticality |
|---|---|---|
| Single Asset Vault (XLS-65) | Shared reserve, investor shares | Required |
| Lending Protocol (XLS-66) | Broker, loans, repayments, first-loss cushion, default | Required |
| MPT | Simulated stablecoin + vault shares | Required |
| Credentials | The gate | Core of "Loaded" |
| Permissioned Domain | Groups the credentials the vault accepts | Core of "Loaded" |
| TokenEscrow | The credit-insurance contract | The twist — has a documented fallback |
| Price Oracle | Valuing the financed receivable | Optional, time-permitting |

**First hour, non-negotiable:** query the Custom Hackathon Devnet node directly (`server_definitions`
/ `feature`) to confirm what's actually enabled there. Everything else depends on this — better to
know it Saturday noon than Sunday 11am. Record findings here once known; nothing below this line is
independently verified yet.

## Build order

Base first. A loan that repays with no twist still wins a prize; an elegant twist on a broken base
wins nothing.

1. **Phase 0 — probe:** connect to the Custom Hackathon Devnet, confirm SingleAssetVault +
   LendingProtocol (V1) + Credentials + PermissionedDomains + TokenEscrow are actually enabled, fund
   accounts (issuer, manager/broker, SME/borrower, 2+ investors, insurer), issue the demo stablecoin.
2. **Phase 1 — minimum bar:** reserve → deposit → loan → repayment → withdrawal, plus one rejected
   transaction from a protocol guardrail. Nothing else is touched until this runs end to end.
3. **Phase 2 — the gate:** `CredentialCreate` + `PermissionedDomainSet`, vault gated. An uncredentialed
   `VaultDeposit`/`LoanSet` must visibly fail.
4. **Phase 3 — the twist, fallback assumed:** credit insurance via TokenEscrow. If TokenEscrow isn't
   actually available on the Custom Hackathon Devnet, present it as a mock and turn the wall itself
   into the written contribution — the finding is worth almost as much as the implementation.

**Running friction log, continuously, not reconstructed Sunday morning:** every unexpected error,
unclear message, and doc/behavior mismatch goes into a friction log the moment it happens, with repro
steps. This is 40% of the grade.

## Demo script

1. An authority issues compliance credentials to the participants.
2. Two investors deposit into the reserve, receive shares.
3. The manager posts first-loss cover.
4. An SME borrows against its invoice; funds move immediately.
5. An investor buys protection from the insurer.
6. The SME repays an installment; share value rises.
7. **Break it on purpose** — over-withdraw past available liquidity: protocol refuses.
8. An uncredentialed SME tries to join: refused.
9. Trigger a real default: the manager's cushion absorbs the shock first, the protection releases,
   investors see exactly what was lost and what was covered.
10. Investors withdraw capital plus yield.

**Live dashboard** (share price, unrealized loss, cushion level, updating during the default trigger)
is worth pursuing for the demo's sake even though it adds no ledger-technical value — it is likely
the single best use of the 10%-weighted presentation score.

## Pitch (4 minutes)

| Time | Content |
|---|---|
| 0:00–0:30 | The problem: the SME waiting 90 days, market size |
| 0:30–1:00 | The four roles, the first-loss cushion |
| 1:00–3:00 | Live demo: full cycle, then the default with the dashboard |
| 3:00–3:30 | The credit-insurance wall and our proposal |
| 3:30–4:00 | Two more major friction points and proposed fixes |

Credit insurance gets ~30 seconds on stage; its weight is in the written report, not the pitch.
**Record a backup video** — devnets can reset without warning, and a live crash at 2pm costs more
than the 20 minutes it takes to film a fallback.

## Deliverables

- Public repo with README (project, setup, track, environment, library version, every XLS-65/66
  transaction used)
- Links to verified on-ledger transactions
- Slide deck, 10 slides max
- Feedback report, 3 pages max, at repo root
- Completed developer-experience form
- DevEx capture hook installed on every machine (already set up for this session: `/xrpl-status`)

**Bonus contributions to aim for:** the drawdown-step documentation PR (simplest available fix), and
a reusable code snippet for the two-party `LoanSet` signature flow — the single most predictable time
sink for every team at this event.

## Risks and fallbacks

| Risk | Fallback |
|---|---|
| TokenEscrow not enabled on this devnet | Insurance becomes a mock; the finding goes in the report |
| Credentials not available | Vault stays open; document the absence as a missing primitive |
| Devnet resets or is unstable | Save keys/provisioning scripts immediately; backup video ready |
| Two-party `LoanSet` signature blocks the team | Give it a dedicated slot early Saturday, not Sunday morning |
| The twist eats the base's time | Hard freeze: nothing new until the full base cycle runs |

## Rules

- Do not build an on-chain trigger for the escrow release — there isn't one. Use a named, documented
  trusted party (the manager, or an explicit "referee" role) and say so plainly in the report; never
  imply trustlessness the protocol doesn't provide.
- Do not overclaim the insurance token as a full secondary debt market — XLS-66 has no `LoanTransfer`;
  say precisely what is and isn't transferable.
- Check every transaction result for `tesSUCCESS` and surface the raw engine result code on failure —
  for these newer tx types the code is the fastest debugging signal.
- Amounts: respect vault `Scale` and MPT precision; never do float math on ledger amounts.
- Pull XLS-65/66 specs fresh from `XRPLF/XRPL-Standards@master` at build time; both are still
  `status: Draft`. When the ledger and the spec disagree, the ledger wins — log the divergence.
