# TrustFlow — Invoice Factoring + Credit Insurance on XRPL

**Hackathon: XRPL Lending Protocol — DeVinci Blockchain × Ripple, Nanterre, 2026-09-12/13.**
Track **1** (open-ended vault, Lending Protocol **V1**, Custom Hackathon Devnet) · Flavour **Loaded**.

An SME ships, invoices, and waits 60–90 days to get paid. TrustFlow pays it immediately: investors
pool capital in a shared reserve, a manager selects which invoices to fund by putting their own
money first-loss, and an insurer covers default risk on a given loan. Every step — deposit, loan,
repayment, default, payout — is native XLS-65/66 plus a thin coupling layer. No custom contracts.

This replaces an earlier Track 2 (closed-ended bond) direction; that work (`docs/SPEC.md`,
`docs/SEAMS.md`) has been deleted as abandoned. `src/ui`'s existing wallet-connection scaffold
(`xrpl-connect`, `WalletContext`, `AccountPanel`) is untouched — see "The webapp" for the page plan.

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

## Known spec/implementation gaps to log (and one bonus PR)

- **No separate drawdown step.** The current spec pays the borrower directly on `LoanSet`; the
  hackathon brief's own minimum-bar wording still implies a separate drawdown. Document this
  divergence — it's a ready-made documentation-fix PR (the simplest bonus contribution available).
- **Batch transactions are currently disabled** after a security issue. Don't build anything on top
  of them; do mention the absence as a legitimate, already-documented missing primitive.
- **A private vault gates deposits but not loans** — found and verified in Phase 2, see the Phase 2
  note below and `FEEDBACK_REPORT.md` §2. This is the project's second-strongest finding after the
  escrow wall, and unlike the wall it is a two-line documentation fix if the behaviour is intended.

## Architecture

| Primitive | Role in TrustFlow | Criticality |
|---|---|---|
| Single Asset Vault (XLS-65) | Shared reserve, investor shares | Required |
| Lending Protocol (XLS-66) | Broker, loans, repayments, first-loss cushion, default | Required |
| MPT | Simulated stablecoin + vault shares | Required |
| Credentials | The gate | Core of "Loaded" |
| Permissioned Domain | Groups the credentials the vault accepts | Core of "Loaded" |
| TokenEscrow | The credit-insurance contract | The twist — has a documented fallback |
| Price Oracle | Valuing the financed receivable | Optional — implemented (`flows/oracle.ts`, `npm run demo oracle`), not yet exercised against a live devnet from any machine in this session |

**First hour, non-negotiable:** query the Custom Hackathon Devnet node directly (`server_definitions`
/ `feature`) to confirm what's actually enabled there. Everything else depends on this — better to
know it Saturday noon than Sunday 11am.

**Phase 0 confirmed (2026-09-12, `npm run probe`, rippled `3.4.0-rc1`, network_id 4001):** all six
required amendments are live — `SingleAssetVault`, `LendingProtocol`, `Credentials`,
`PermissionedDomains`, `TokenEscrow`, `MPTokensV1`. No fallback needed for TokenEscrow or Credentials.
All 8 role accounts (authority, issuer, manager, sme, smeUncredentialed, investorA, investorB,
insurer) funded with 1000 XRP each via the faucet; seeds in `.env` (gitignored). Demo stablecoin
(`TFEUR`) issued via `MPTokenIssuanceCreate` — issuance id in `state/hackathon.json`.

**Phase 1 minimum bar confirmed (2026-09-12):** `setup` → `s1` (credentials) → `s2` (deposit) → `s3`
(cover) → `s4` (loan origination) → `s6` (full repayment) → `s7` (rejected over-withdraw,
`tecINSUFFICIENT_FUNDS`) → `s10` (withdrawal) all land `tesSUCCESS` (or the expected guardrail code)
end to end on the Custom Hackathon Devnet. Two real bugs surfaced and are fixed, see
`docs/FRICTION.md` for the full writeup:
- `LoanSet`'s `PrincipalRequested` "Number" field is **not** auto-scaled by the funding MPT's
  `AssetScale` — it disburses raw base units. `flows/loan.ts originate()` now pre-scales it with
  `mptBaseUnits()`; passing the real EUR magnitude directly put 100x too little TFEUR in the
  borrower's account.
- `LoanPay`'s `tfLoanFullPayment` returns `tecKILLED` when `Loan.PaymentRemaining == 1` (XLS-66
  §3.11.2 says to use a regular payment for the final installment instead) — `flows/loan.ts pay()`
  now checks `PaymentRemaining` and drops the flag on the last payment.

**Phase 2 confirmed (2026-09-12, `npm run demo gate` + `s8`):** the gate is verified on-ledger, not
just wired. `flows/gate.ts` walks one account through every credential state and records what the
ledger answers; hashes are in README's Phase 2 table. Results:
- `VaultDeposit` → `tecNO_AUTH` with no credential, **and equally with an issued-but-unaccepted
  one** — `CredentialAccept` is load-bearing, and skipping it builds a gate that refuses everyone.
- `VaultDeposit` → `tesSUCCESS` once accepted; → `tecNO_AUTH` again after `CredentialDelete`, while
  `VaultWithdraw` still returns `tesSUCCESS`. The ungated-withdrawal design choice is a ledger
  guarantee (XLS-65 §7), not our leniency — say that on stage.
- `s8` funds the intruder before it is refused, so the rejection is unambiguously about the
  credential and not an empty balance.

**Third major finding, alongside the escrow wall: a private vault gates deposits but not loans.**
`LoanSet` never consults the vault's `PermissionedDomain` — XLS-66 §3.8.5.2's 24 failure conditions
contain no domain check, and its two `tecNO_AUTH` cases are asset-holding authorization, a different
question. An account refused `VaultDeposit` with `tecNO_AUTH` was handed that same vault's assets as
a loan in the very next transaction, reproduced on two independent runs. Not an exploit — `LoanSet`
is dual-signed, so the broker must still counter-sign — but with a domain configured, an
uncredentialed borrower is stopped by the broker's off-ledger discretion alone. Frame it exactly
that way; do not overclaim it as a vulnerability. `FEEDBACK_REPORT.md` §2.

Next: Phase 3 (the twist) — `flows/insurance.ts` is implemented but `s5`/`s9`/`prestage` have not
been exercised end to end against the live devnet.

## Build order

Base first. A loan that repays with no twist still wins a prize; an elegant twist on a broken base
wins nothing.

1. **Phase 0 — probe:** connect to the Custom Hackathon Devnet, confirm SingleAssetVault +
   LendingProtocol (V1) + Credentials + PermissionedDomains + TokenEscrow are actually enabled, fund
   accounts (issuer, manager/broker, SME/borrower, 2+ investors, insurer), issue the demo stablecoin.
2. **Phase 1 — minimum bar:** reserve → deposit → loan → repayment → withdrawal, plus one rejected
   transaction from a protocol guardrail. Nothing else is touched until this runs end to end.
3. **Phase 2 — the gate:** `CredentialCreate` + `PermissionedDomainSet`, vault gated. An uncredentialed
   `VaultDeposit` must visibly fail. ✅ done — and note the original wording here also expected an
   uncredentialed `LoanSet` to fail. **It does not, and cannot:** the protocol has no such check
   (see the Phase 2 note above). The demo shows the deposit refusal; the loan side became a finding
   rather than a feature.
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
8. An uncredentialed SME — visibly holding the money — tries to join: refused. Then revoke a real
   investor's credential: refused on the way in, still paid on the way out. Name that as a design
   choice and a ledger guarantee, not leniency.
9. Trigger a real default: the manager's cushion absorbs the shock first, the protection releases,
   investors see exactly what was lost and what was covered.
10. Investors withdraw capital plus yield.

**Live dashboard** (share price, unrealized loss, cushion level, updating during the default trigger)
is worth pursuing for the demo's sake even though it adds no ledger-technical value — it is likely
the single best use of the 10%-weighted presentation score. See "The webapp" below for the full
page plan.

## The webapp

React 19 + Vite, `src/ui/`. No backend. `App.tsx` is a shell — header, `components/Nav.tsx`,
footer — over a hash router with six pages (`pages/`, plus `dashboard/`).

`components/AccountPanel.tsx` is the wallet-facing widget. Note for whoever wires up any
transaction-submitting UI: every flow is currently signed in `src/protocol/` with seeds from
`.env`, `LoanSet` is dual-signed (a connected wallet only ever holds one of the two keys it
needs), and a visitor's wallet holds no `Credential`, so a deposit from it lands `tecNO_AUTH` —
the gate working as designed, but worth surfacing clearly in the UI rather than as a bare
transaction failure.

**Data sources, both of them:** `public/state.json` (object IDs — `saveState()` in
`lib/state.ts` mirrors `state/hackathon.json` there on every write, so Vite serves it at
`/state.json`) and live RPC/subscriptions against `NETWORK.wss`. Nothing else. If a page needs
a fact that is in neither, the fix is to write it into the state file from the protocol scripts,
not to add a server.

### Pages

| Route | Page | Serves | Status |
|---|---|---|---|
| `/` | Home | Pitch 0:00–1:00 | ✅ built |
| `/dashboard` | Dashboard | Pitch 1:00–3:00 | ✅ built |
| `/gate` | The Gate | Pitch 3:30–4:00, the "Loaded" flavour | ✅ built |
| `/insurance` | Protection | Pitch 3:00–3:30, the wall | ✅ built |
| `/explorer` | Explorer | "Links to verified on-ledger transactions" | ✅ built |
| `/findings` | Findings | The 40%-weighted feedback, made legible | ✅ built |

All six are in. What is *not* verified is how they look with live data: they have been
typechecked, built and served, but never opened in a browser against a populated
`state.json` (this machine has no `.env`, no `state/`, and no browser tooling in the
session that wrote them). First thing to do on a machine with the seeds: `npm run demo
setup`, then walk all six routes.

**1. Home / landing.** The SME waiting 90 days, the four roles and who puts money in first-loss,
and the one sentence that matters: every step is native XLS-65/66, no custom contracts. One CTA
into `/dashboard`. Static — no RPC, so it renders even if the devnet is down mid-pitch. It is also
the safe screen to open on if the ledger has reset.

**2. Dashboard** (`dashboard/Dashboard.tsx`, live). Share price, `AssetsTotal`/`AssetsAvailable`,
`LossUnrealized`, manager cover vs `CoverRateMinimum`, the two loans with their status flags, the
insurance state, and a ledger-close event feed. This is the screen the default trigger (`s9`) is
performed against — the cushion draining and `LossUnrealized` moving is the whole visual payload of
the demo. It polls `/state.json` every 5s and re-reads the ledger on every `ledgerClosed`.

**3. The Gate.** The flavour, on screen. Each of the 8 role accounts with its address, TFEUR
balance and credential state (`missing` / `issued, not accepted` / `accepted`) — read live via
`account_objects type=credential`, checking **both** the subject's and the issuer's owner
directory, because an unaccepted credential sits in the issuer's (see
`flows/credentials.ts credentialStatus()`). Then the four-state matrix `flows/gate.ts` proved,
with its hashes and explorer links: deposit refused with no credential, refused with an
unaccepted one, allowed once accepted, refused again after revocation — and withdrawal still
allowed throughout. The ungated withdrawal is labelled as an XLS-65 §7 guarantee, not our leniency.
Below that, the deposits-gated-but-loans-not finding, stated in exactly the words the Rules
section fixes — no "vulnerability", no "exploit".

**4. Protection (insurance).** The escrow as a diagram: insurer locks, buyer pays premiums,
manager-as-referee holds the fulfillment. Show the live escrow object and whether it is locked,
released or expired. The page's real content is **the wall**: TokenEscrow releases on time or on a
crypto-condition, never on another ledger object's state, so the referee is a named trusted party
and the product is not trustless. Name the party on screen. Do not draw an arrow that implies the
`Loan`'s default flag reaches the escrow by itself.

**5. Explorer.** Every transaction the demo produced, newest first: timestamp, type, engine result
code, and a link to `custom.xrpl.org`. Failures (`tecNO_AUTH`, `tecINSUFFICIENT_FUNDS`,
`tecKILLED`) are first-class rows and rendered as *deliberate* where they were — the rejected
transactions are evidence, not errors. `lib/submit.ts` pushes `{ts, type, result, hash}` on every
submission — successes, deliberate refusals and surprises alike — so the page renders
`state.json`'s `txLog` newest-first, with a filter and a count of each kind. With no live log
(a fresh clone, or after a devnet reset) it falls back to the verified hashes transcribed in
`src/ui/lib/evidence.ts` and says on screen that it is a recorded run.

**6. Findings.** The three discoveries as cards — the escrow wall, deposits-gated-but-loans-not,
and the `PrincipalRequested` base-unit convention — each with its repro command, its transaction
hashes, and its proposed fix, linking through to `/explorer`. Source of truth stays
`FEEDBACK_REPORT.md` and `docs/FRICTION.md`; this page renders them, it does not restate them in
different words, or the two drift apart by Sunday morning.

### Routing and known gaps

- **Router:** `lib/router.ts`, a `hashchange` listener over a six-entry route union — no
  `react-router-dom`. Hash routes survive being opened from `file://` or a stale `vite preview`
  if the dev server dies mid-pitch.
- **Scaling is fixed and lives in one place.** `lib/format.ts` shifts base units to euros as
  string arithmetic at the render edge (`eur()`, `sharePrice()`, `subtractBase()`); no float
  ever touches a ledger amount, and the old 100x-high Dashboard figures are gone. Anything
  derived from two amounts (assets deployed, cover shortfall) is BigInt, not subtraction in
  doubles. The one float is `fillPercent()`, which only ever becomes a CSS bar width.
- **One WebSocket for the whole app** (`lib/ledger.tsx`): connect with backoff, re-`subscribe`
  after every reconnect, `tick` on each `ledgerClosed` as the refetch trigger, and
  `refreshEveryTicks` for the fan-out-heavy Gate page. Switching routes never re-handshakes.
- **Ledger reads are typed, not cast.** xrpl.js 5.2.0 does ship XLS-65/66 models — reachable as
  `import { LedgerEntry } from 'xrpl'` then `LedgerEntry.Loan` / `LedgerEntry.LoanFlags` — so the
  UI narrows on `LedgerEntryType` instead of casting `as never` the way `src/protocol` still does.
  The single exception is `MPToken`, missing from the union; see `FEEDBACK_REPORT.md §9`.
- **`demo.ts` now writes two extra facts into `state.json`** so the browser can read them:
  `accounts` (role → address, written on every command) and `gate` (the last `npm run demo gate`
  matrix, hashes included). The Gate page prefers those over the transcribed fallback.
- The `xrpl-connect` scaffold is kept and now appears only on Home, as `AccountPanel` plus the
  WalletConnect notice; the demo path does not use it. Do not assume it fits any new screen
  without checking.

## Pitch (4 minutes)

| Time | Content |
|---|---|
| 0:00–0:30 | The problem: the SME waiting 90 days, market size |
| 0:30–1:00 | The four roles, the first-loss cushion |
| 1:00–3:00 | Live demo: full cycle, then the default with the dashboard |
| 3:00–3:30 | The credit-insurance wall and our proposal |
| 3:30–4:00 | The gate: deposits permissioned, loans not — plus one more friction point and the fixes |

Credit insurance gets ~30 seconds on stage; its weight is in the written report, not the pitch.
**Record a backup video** — devnets can reset without warning, and a live crash at 2pm costs more
than the 20 minutes it takes to film a fallback.

## Deliverables

- Public repo with README (project, setup, track, environment, library version, every XLS-65/66
  transaction used)
- Links to verified on-ledger transactions
- Slide deck, 10 slides max — ✅ drafted as an Artifact (10 slides, matches the pitch script below);
  export/attach it to the final submission
- Feedback report, 3 pages max, at repo root
- Completed developer-experience form — ⬜ needs the organizer's form link; not yet done
- DevEx capture hook installed on every machine (already set up for this session: `/xrpl-status`)
- Backup demo video — ⬜ needs an actual screen recording of a live run against seeded devnet
  accounts; not something buildable from a machine with no `.env`/seeds

**Bonus contributions to aim for:** the drawdown-step documentation PR (simplest available fix), and
a reusable code snippet for the two-party `LoanSet` signature flow — the single most predictable time
sink for every team at this event.

- ✅ **`LoanSet` dual-sign snippet**: `docs/snippets/loan-set-dual-sign.ts` — standalone,
  project-independent, documents the fee-before-signing gotcha and that `autofill()` already
  handles the `>= 2x` base fee (FEEDBACK_REPORT.md §5).
- 🟡 **Drawdown-step doc PR**: patch + PR text ready in `docs/bonus/loanset-no-drawdown-pr.md` and
  `docs/bonus/loanset-no-drawdown.patch`, committed locally against a clone of
  `XRPLF/XRPL-Standards`. Not yet opened upstream — this machine has no `gh` installed/authenticated,
  and forking a third-party repo under a personal GitHub identity needs a human's go-ahead, not an
  unattended agent action.

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
- Do not present the "private vault gates deposits but not loans" finding as a vulnerability or an
  exploit. `LoanSet` is dual-signed; the broker must still counter-sign, and nobody can drain a
  reserve unilaterally. The claim is precisely this: with a `PermissionedDomain` configured, an
  uncredentialed borrower is stopped by the broker's off-ledger discretion alone, not by the
  protocol. Overstating it turns the project's second-best finding into something a judge can
  dismiss in one sentence.
- Check every transaction result for `tesSUCCESS` and surface the raw engine result code on failure —
  for these newer tx types the code is the fastest debugging signal.
- Amounts: respect vault `Scale` and MPT precision; never do float math on ledger amounts.
- Pull XLS-65/66 specs fresh from `XRPLF/XRPL-Standards@master` at build time; both are still
  `status: Draft`. When the ledger and the spec disagree, the ledger wins — log the divergence.
