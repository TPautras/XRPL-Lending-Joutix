# TrustFlow — Invoice Factoring + Credit Insurance on XRPL

**Hackathon: XRPL Lending Protocol — DeVinci Blockchain × Ripple, Nanterre, 2026-09-12/13.**
Track **1** (open-ended vault, Lending Protocol **V1**, Custom Hackathon Devnet) · Flavour **Loaded**.

An SME ships, invoices, and waits 60–90 days to get paid. TrustFlow pays it immediately: investors
pool capital in a shared reserve, a manager selects which invoices to fund by putting their own
money first-loss, and an insurer covers default risk on a given loan. Every step — deposit, loan,
repayment, default, payout — is native XLS-65/66 plus a thin coupling layer. No custom contracts.

This replaces an earlier Track 2 (closed-ended bond) direction; that work (`docs/SPEC.md`,
`docs/SEAMS.md`) has been deleted as abandoned. `src/ui`'s existing wallet-connection scaffold
(`xrpl-connect`, `WalletContext`, `AccountPanel`) is untouched and kept as a single read-only
widget — see "The webapp" for the page plan and why nothing in the browser signs.

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
| Price Oracle | Valuing the financed receivable | Optional, time-permitting |

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

React 19 + Vite, `src/ui/`. No backend, no router yet. Today it is a single screen: `App.tsx`
renders `dashboard/Dashboard.tsx` plus the `xrpl-connect` wallet scaffold.

**The one rule that shapes every page: the webapp is read-only.** No page gets a button that
submits a TrustFlow transaction, for three independent reasons, and all three are worth saying
out loud on stage rather than hiding:

1. Every flow is signed in `src/protocol/` with seeds from `.env`. The browser holds no key.
2. `LoanSet` is dual-signed — a connected wallet holds one of the two keys it needs, never both.
3. A visitor's wallet holds no `Credential`, so a deposit from it lands `tecNO_AUTH`. That is the
   gate working exactly as designed, but on stage it reads as a broken app.

`components/AccountPanel.tsx` stays as the single wallet-facing widget: it shows the connected
account and nothing else. Keep it that way.

**Data sources, both of them:** `public/state.json` (object IDs — `saveState()` in
`lib/state.ts` mirrors `state/hackathon.json` there on every write, so Vite serves it at
`/state.json`) and live RPC/subscriptions against `NETWORK.wss`. Nothing else. If a page needs
a fact that is in neither, the fix is to write it into the state file from the protocol scripts,
not to add a server. Two facts were added that way for the Gate page: `state.accounts` (the eight
role addresses, written by **`npm run demo accounts`** — local only, derives public addresses from
`.env` and submits nothing) and `state.gate` (the Phase 2 access matrix, written by
`npm run demo gate`; before that command has been run the page says so instead of inventing rows).
**No seed ever goes in the state file** — it is mirrored into `public/` and served to the browser.

### Pages

| Route | Page | Serves | Status |
|---|---|---|---|
| `/` | Home | Pitch 0:00–1:00 | ✅ built (`pages/Home.tsx`) |
| `/dashboard` | Dashboard | Pitch 1:00–3:00 | ✅ exists |
| `/gate` | The Gate | Pitch 3:30–4:00, the "Loaded" flavour | ✅ built (`pages/Gate.tsx`) |
| `/insurance` | Protection | Pitch 3:00–3:30, the wall | to build |
| `/explorer` | Explorer | "Links to verified on-ledger transactions" | to build |
| `/findings` | Findings | The 40%-weighted feedback, made legible | to build |

Build order if time runs short: Home → Gate → Explorer → Findings → Insurance. The Dashboard
already carries the demo; everything after Gate is presentation polish, and a half-finished page
is worse on stage than an absent one. **Home, Dashboard and Gate are done** — Explorer is next,
and it is still blocked on `txLog` never being appended to.

**1. Home / landing.** The SME waiting 90 days, the four roles and who puts money in first-loss,
and the one sentence that matters: every step is native XLS-65/66, no custom contracts. One CTA
into `/dashboard`. Static — no RPC, so it renders even if the devnet is down mid-pitch. It is also
the safe screen to open on if the ledger has reset.

> **Primitives:** none (narrative only). **Ledger objects:** none. **Data:** none — deliberately.

**2. Dashboard** (`dashboard/Dashboard.tsx`, live). Share price, `AssetsTotal`/`AssetsAvailable`,
`LossUnrealized`, manager cover vs `CoverRateMinimum`, the two loans with their status flags, the
insurance state, and a ledger-close event feed. This is the screen the default trigger (`s9`) is
performed against — the cushion draining and `LossUnrealized` moving is the whole visual payload of
the demo. It polls `/state.json` every 5s and re-reads the ledger on every `ledgerClosed`.

> **Primitives:** XLS-65 (vault), XLS-66 (broker + loans), MPT (vault shares).
> **Ledger objects:** `Vault` (+ its share `MPTokenIssuance`), `LoanBroker`, `Loan` ×2, `Escrow`
> (state flags only). **Effects of:** `VaultDeposit`, `VaultWithdraw`, `LoanBrokerCoverDeposit`,
> `LoanSet`, `LoanPay`, `LoanManage`. **Data:** `vault_info`, `ledger_entry`, `subscribe
> streams:['ledger']`.

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

> **Primitives:** XLS-70 (credentials), XLS-80 (permissioned domain), MPT (`DomainID` on the share
> issuance, TFEUR balances), XLS-65 §3.5.2.2 #6 and §7 (the deposit check and the withdrawal
> carve-out). **Ledger objects:** `Credential` ×8, `PermissionedDomain`, `MPToken`,
> `MPTokenIssuance`. **Shows:** `CredentialCreate`, `CredentialAccept`, `CredentialDelete`,
> `PermissionedDomainSet`, and the `VaultDeposit`/`VaultWithdraw`/`LoanSet` results they gate.
> **Result codes on screen:** `tecNO_AUTH`, `tesSUCCESS`. **Data:** `account_objects
> type=credential` (both directories), `ledger_entry`, `state.json` hashes.

**4. Protection (insurance).** The escrow as a diagram: insurer locks, buyer pays premiums,
manager-as-referee holds the fulfillment. Show the live escrow object and whether it is locked,
released or expired. The page's real content is **the wall**: TokenEscrow releases on time or on a
crypto-condition, never on another ledger object's state, so the referee is a named trusted party
and the product is not trustless. Name the party on screen. Do not draw an arrow that implies the
`Loan`'s default flag reaches the escrow by itself.

> **Primitives:** TokenEscrow (MPT-denominated), PREIMAGE-SHA-256 crypto-conditions
> (`five-bells-condition`), XLS-66 `LoanManage tfLoanDefault` as the *off-ledger* trigger.
> **Ledger objects:** `Escrow` (`Condition`, `CancelAfter`, `Destination`, `OfferSequence`).
> **Shows:** `EscrowCreate`, `EscrowFinish`, `EscrowCancel`, plus the premium `Payment`s.
> **Data:** `account_objects type=escrow` on the insurer, `state.insurance`.

**5. Explorer.** Every transaction the demo produced, newest first: timestamp, type, engine result
code, and a link to `custom.xrpl.org`. Failures (`tecNO_AUTH`, `tecINSUFFICIENT_FUNDS`,
`tecKILLED`) are first-class rows and rendered as *deliberate* where they were — the rejected
transactions are evidence, not errors. **Prerequisite: `HackathonState.txLog` is declared in
`lib/state.ts` and nothing ever appends to it.** `lib/submit.ts` has to push `{ts, type, result,
hash}` on every submission before this page has anything to show.

> **Primitives:** all of them — this is the page that discharges the "every XLS-65/66 transaction
> used" deliverable, so it must cover all 18 types in the matrix below. **Data:** `state.txLog`
> only; no RPC. Group rows by demo step (`setup`, `s1`…`s10`) so the audience can follow along.

**6. Findings.** The three discoveries as cards — the escrow wall, deposits-gated-but-loans-not,
and the `PrincipalRequested` base-unit convention — each with its repro command, its transaction
hashes, and its proposed fix, linking through to `/explorer`. Source of truth stays
`FEEDBACK_REPORT.md` and `docs/FRICTION.md`; this page renders them, it does not restate them in
different words, or the two drift apart by Sunday morning.

> **Primitives:** TokenEscrow (the wall), XLS-66 §3.8.5.2 (no domain check on `LoanSet`), XLS-66
> §3.11.2 + MPT `AssetScale` (the two Phase 1 bugs). **Result codes explained:** `tecNO_AUTH`,
> `tecKILLED`, `tecINSUFFICIENT_FUNDS`. **Data:** the two markdown files, rendered.

### Feature coverage

Every transaction type the demo submits, and the page that shows it. A type with no page is a
hole in the "every XLS-65/66 transaction used" deliverable.

| Transaction | Primitive | Shown on |
|---|---|---|
| `MPTokenIssuanceCreate`, `MPTokenAuthorize` | MPT (XLS-33) | Explorer, Gate (balances) |
| `Payment` (TFEUR payouts, premiums) | MPT | Explorer, Insurance |
| `PermissionedDomainSet` | XLS-80 | Gate, Explorer |
| `CredentialCreate`, `CredentialAccept`, `CredentialDelete` | XLS-70 | Gate, Explorer |
| `VaultCreate` | XLS-65 | Dashboard, Explorer |
| `VaultDeposit` | XLS-65 | Dashboard, Gate, Explorer |
| `VaultWithdraw` | XLS-65 | Dashboard, Gate, Explorer |
| `LoanBrokerSet`, `LoanBrokerCoverDeposit` | XLS-66 | Dashboard (cushion), Explorer |
| `LoanSet` | XLS-66 | Dashboard, Gate (the finding), Explorer |
| `LoanPay` | XLS-66 | Dashboard, Explorer, Findings (`tecKILLED`) |
| `LoanManage` | XLS-66 | Dashboard (status flags), Insurance (the trigger), Explorer |
| `EscrowCreate`, `EscrowFinish`, `EscrowCancel` | TokenEscrow | Insurance, Explorer |

Price Oracle is in the Architecture table as optional and is **not used** — no page claims it.
If it stays unused, say so once on Home rather than letting a judge wonder.

### Routing and known gaps

- **Router: done.** `src/ui/router.ts`, ~45 lines of `hashchange` over `useSyncExternalStore`, no
  `react-router-dom`. Hash routes survive being opened from a stale `vite preview` if the dev server
  dies. `ROUTES` holds all six; **`BUILT` is what the nav renders** — add a route to `BUILT` only
  when its page exists, and anything unknown (a typo, a stale link) falls back to Home rather than
  a blank screen.
- ~~**The Dashboard displays base units as euros.**~~ **Fixed.** All formatting now lives in
  `src/ui/lib/format.ts` and divides by `10 ** TFEUR_SCALE` at the render edge only; the hook keeps
  raw base units throughout. Share price is the one figure that must **not** be divided — it is
  `AssetsTotal / OutstandingAmount`, a ratio of two base-unit counts, so it is already scale-free.
  The original rule stands for anything new: divide at the render edge only — never do float math
  before that, and never on a value about to be submitted.
- **Two "Connect wallet" buttons in the header on `/dashboard`.** `WalletConnector` renders its own
  styled `.btn` *and* `<xrpl-wallet-connector>`, which draws a button of its own. Pre-existing, and
  cosmetic, but it is on the demo screen. Fixing it means dropping our button and letting the custom
  element's be the trigger (it loses our theming), so it needs a click-test, not a blind edit.
- **`txLog` is empty** — see Explorer above.
- The `xrpl-connect` scaffold is kept but unused by the demo path; do not assume it fits any new
  screen without checking.

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
- Do not present the "private vault gates deposits but not loans" finding as a vulnerability or an
  exploit. `LoanSet` is dual-signed; the broker must still counter-sign, and nobody can drain a
  reserve unilaterally. The claim is precisely this: with a `PermissionedDomain` configured, an
  uncredentialed borrower is stopped by the broker's off-ledger discretion alone, not by the
  protocol. Overstating it turns the project's second-best finding into something a judge can
  dismiss in one sentence.
- Do not give the webapp a button that submits a TrustFlow transaction. The browser holds no key,
  `LoanSet` needs two, and an uncredentialed visitor's deposit lands `tecNO_AUTH` — the gate
  working correctly, but indistinguishable on stage from a broken app. See "The webapp".
- Check every transaction result for `tesSUCCESS` and surface the raw engine result code on failure —
  for these newer tx types the code is the fastest debugging signal.
- Amounts: respect vault `Scale` and MPT precision; never do float math on ledger amounts.
- **Never render a TFEUR amount with a `€` sign.** TFEUR is an MPT our own issuer minted on a
  devnet — no reserve, no redemption, no obligation. It is denominated in euros; it is not euros,
  and a euro glyph on stage claims a fiat redemption nobody here can honour. The UI shows the
  ticker (`2,030.00 TFEUR`) via `tfeur()` in `src/ui/lib/format.ts`, or a bare number under a
  column header that already says TFEUR.
- Pull XLS-65/66 specs fresh from `XRPLF/XRPL-Standards@master` at build time; both are still
  `status: Draft`. When the ledger and the spec disagree, the ledger wins — log the divergence.
