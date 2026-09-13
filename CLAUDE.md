# TrustFlow — Invoice Factoring + Credit Insurance on XRPL

Hackathon project (XRPL Lending Protocol — DeVinci Blockchain × Ripple, 2026-09-12/13; Track 1,
targeting Lending Protocol **V1** on the Custom Hackathon Devnet — confirm this is actually what's
live, see "Verify first" below; flavour **Loaded**). An SME ships, invoices, and
waits 60–90 days to get paid. TrustFlow pays it immediately: investors pool capital in a shared
reserve, a manager selects which invoices to fund by putting their own money first-loss, and an
insurer covers default risk on a given loan. Every step — deposit, loan, repayment, default, payout
— is native XLS-65/66 plus a thin coupling layer. No custom contracts.

## Source of truth — read this before trusting anything below

This file holds durable rules only: things that shouldn't need to change from commit to commit.
Everything time-bound lives elsewhere, and elsewhere is authoritative over this file if they ever
disagree:

- **README.md** — current architecture, page list, and verified on-ledger evidence tables.
- **FEEDBACK_REPORT.md** — the graded findings, written out in full.
- **docs/FRICTION.md** — the append-only friction log. Write to it the instant something breaks or
  surprises you, with repro steps — not reconstructed later.
- **docs/PROGRESS.md** — phase timeline, demo script, pitch timing, deliverables checklist, risks
  table. Update that file as status changes; don't let this one accumulate dated status again.

If a rule below turns out to be stale, fix the code/README and correct this file in the same
change — don't let a comment here quietly outlive the behavior it describes.

## Verify first — two open questions, both time-bound

Neither of these is a durable fact yet. Full context, rationale, and removal conditions:
`docs/PROGRESS.md` → "Open risks (detail)". Run the check before relying on anything downstream
of it; update that PROGRESS.md entry once resolved, don't let detail pile up back into this file.

- **Signing migration is targeted, not landed** — nothing in `src/ui` implements it yet (its own
  code comments still say `LoanSet` "stays a scripted flow"). `git status --short src/protocol
  package.json`; `D` lines mean the old scripted path is gone but its wallet-only replacement
  isn't built. See "Webapp signing rule" below for what's settled vs. still open.
- **Devnet protocol version unconfirmed (V1 vs V1.1)** —
  `curl -s $DEVNET_RPC -d '{"method":"feature"}' | jq '.result.features | to_entries[] | select(.value.name | test("Lending"; "i"))'`;
  more than one Lending-related amendment enabled means stop and re-derive rather than guess.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — typecheck, then production build
- `npm run typecheck` — `tsc --noEmit`
- `npm run smoke` / `npm run smoke:live` — headless route smoke test (`smoke:live` hits the real
  devnet)
- `npm run visual` — visual regression capture

No `npm run probe` / `npm run demo` right now — see "Verify first" above; they're gone pending the
signing-path migration, not renamed or moved.

**Standing prerequisite: live verification needs a human first.** `npm run smoke:live` and
anything touching real ledger state needs funded seed accounts (`.env`, currently gitignored and
not present on every machine) and a reachable, correctly-configured devnet. No amount of
documentation removes this — an agent working alone can typecheck, build, and reason about code,
but cannot originate credentials, fund a vault, or confirm a fix against a live ledger without a
human supplying access first.

## Code quality

- **TypeScript strict mode is the only enforced gate** — there's no ESLint/Prettier config in
  this repo. `tsconfig.json` has `strict`, `noUnusedLocals`, `noUnusedParameters`, and
  `noFallthroughCasesInSwitch` on; `npm run typecheck` / `npm run build` are what actually block a
  broken change, so write to that bar rather than assuming a linter will catch anything.
- **`src/ui/components/ui/*` is shadcn/ui-generated, not hand-authored.** For a structural change
  (a new variant, a different primitive), regenerate via the shadcn CLI rather than hand-editing
  the file; a small in-place bugfix (a prop type, a class tweak) is fine.
- **Testing is smoke + visual, not unit tests.** `npm run smoke` mounts the real app in jsdom
  against the live devnet and walks every route — it's caught real bugs this way (a fully-repaid
  `Loan` reported as "Active", a chart series that never accumulated a second point on a quiet
  reserve) that typecheck and build cannot, but it does not check layout (`ResponsiveContainer`
  measures to zero in jsdom — read a pass as "nothing crashed," not "it looks right"). `npm run
  visual` is what actually checks appearance. Before committing a change that touches a route:
  `npm run typecheck && npm run smoke`, plus `npm run visual` if it changes anything visual.
- **Path alias `@/*` → `src/ui/*`** (`tsconfig.json`) — use it for anything under `src/ui` instead
  of a relative `../../..` chain.

## The four roles

| Role | Does | On-ledger primitive |
|---|---|---|
| Investor | Deposits into the shared reserve, gets a share back | `VaultDeposit`, vault shares (MPT) |
| Manager (broker) | Picks which invoices to fund; posts first-loss capital before lending | `LoanBrokerSet`, `LoanBrokerCoverDeposit` |
| SME (borrower) | Borrows against an invoice, repays on schedule | `LoanSet` (dual-signed with the broker), `LoanPay` |
| Insurer | Sells default protection on a specific loan, locks the covered amount, keeps premiums if the loan performs | TokenEscrow (see the wall, below) |

Share value rises mechanically as the reserve collects interest — no manual distribution; the
appreciation is in the share price itself (`AssetsTotal` growth).

A fifth account, the **Authority**, sits outside these four: not an economic participant, it just
issues the compliance credential the reserve requires (`CredentialCreate`, `PermissionedDomainSet`).

## Non-negotiable rules

1. **Naming.** Call the product "credit insurance" (assurance-crédit) everywhere user-facing — UI,
   pitch, README prose. The precise technical term ("credit default swap") stays confined to the
   written feedback report only; it's the same economic object as Coface/Allianz Trade's business,
   not the 2008 one, and the framing matters to a judge.

2. **Amounts are MPTAmount base units — never floats, always respect `Scale`/`AssetScale`.**
   - `LoanSet`'s `PrincipalRequested` "Number" field is **not** auto-scaled by the funding MPT's
     `AssetScale` — it disburses raw base units. Pre-scale it before calling, or a real EUR
     magnitude passed directly puts ~100x too little into the borrower's account.
   - `LoanPay` with `tfLoanFullPayment` returns `tecKILLED` when `Loan.PaymentRemaining == 1`
     (XLS-66 §3.11.2: use a regular payment for the final installment instead). Check
     `PaymentRemaining` and drop the flag on the last payment.
   - Any value derived from two ledger amounts (assets deployed, cover shortfall) is BigInt/string
     arithmetic, never a float subtraction. The one legitimate float is a fill-percentage used
     purely as a CSS bar width — nothing that reaches a transaction.

3. **The gating asymmetry.** `VaultDeposit` and borrowing/shares need an accepted `Credential` in
   the vault's `PermissionedDomain`; `VaultWithdraw` is deliberately ungated (XLS-65 §7 guarantee,
   not leniency — an expired credential must never trap an investor's funds). `LoanSet` never
   checks that `PermissionedDomain` (XLS-66 §3.8.5.2 has no domain-check failure condition) — an
   uncredentialed borrower is stopped only by the broker's off-ledger choice to counter-sign.
   **Never call this a vulnerability or exploit**: `LoanSet` is dual-signed, so nobody drains a
   reserve unilaterally — say "stopped by discretion, not by the protocol," nothing stronger.

4. **The escrow wall.** TokenEscrow releases only on a time condition or a crypto-condition
   fulfillment — it cannot read another ledger object's state, so it cannot ask "is this `Loan` in
   default?" and self-trigger. Any default-triggered release needs a named, documented trusted
   party (the manager, or an explicit referee role) to observe the default and submit the release.
   Never imply a trustless trigger exists; say plainly who the trusted party is.

5. **No `LoanTransfer` in XLS-66.** A `Loan` stays permanently tied to the Broker+Borrower pair
   that dual-signed it at creation. Any loan-level secondary market — including the insurance
   token itself — is an off-protocol overlay, not a native reassignment. Don't overclaim it as a
   full secondary debt market.

6. **No separate drawdown step.** `LoanSet` pays the borrower directly; there is no drawdown
   transaction in this spec version, despite the hackathon brief's minimum-bar wording implying
   one. This is a documented spec/brief divergence, not a bug to work around — don't add a
   drawdown step to the UI or scripts to match the brief. (Doc-fix PR drafted:
   `docs/bonus/loanset-no-drawdown-pr.md`.)

7. **Batch transactions are disabled** on this devnet after a security issue. Don't build anything
   on top of them; their absence is itself a legitimate, already-documented finding.

8. **Check every transaction result for `tesSUCCESS` and surface the raw engine code on
   failure** (`tecNO_AUTH`, `tecINSUFFICIENT_FUNDS`, `tecKILLED`, …) — for these newer XLS-65/66
   tx types the code is the fastest debugging signal. In the UI, a deliberate protocol refusal
   (an uncredentialed deposit, an over-withdraw) must render as evidence of the gate working, not
   as a bare error.

9. **Specs are Draft and move.** Pull XLS-65/66 text fresh from `XRPLF/XRPL-Standards@master`
   rather than trusting a cached reading of it. When the live ledger and the spec disagree, the
   ledger wins — log the divergence in `docs/FRICTION.md`.

10. **Friction log discipline.** Every unexpected error, unclear message, or doc/behavior mismatch
    goes into `docs/FRICTION.md` the moment it happens, with repro steps — not reconstructed
    afterward from memory.

## Webapp signing rule

Before wiring any new submit button, ask: **does this transaction need only the signing
account's own signature?**

- Yes → wallet path (`useWalletSubmit()` / `lib/walletActions.ts`) — this already covers
  `VaultDeposit`, `VaultWithdraw`, `LoanPay`, `LoanBrokerCoverDeposit`, `CredentialAccept`, and
  Market's `EscrowCreate`/`EscrowFinish`/`EscrowCancel`. Once the signing migration (see "Verify
  first") lands, this also covers the single-signer privileged transactions —
  `CredentialCreate`/`CredentialDelete` (the authority connects its own wallet for that action),
  `LoanBrokerSet`/`LoanManage`/`VaultCreate` (the manager, acting as broker-owner, connects
  theirs). None of these need a visitor's wallet — they need that specific privileged account's
  own wallet, connected for that one action, not a seed in `.env`.
- `LoanSet` is the one exception, and it's decided (not yet built): xrpl.js's
  `signLoanSetByCounterparty()` needs a raw `Wallet` keypair for the counter-signature, which no
  browser wallet extension will ever hand the app — so the borrower signs (not submits) via the
  connected wallet, and a small dedicated **signing service** (TrustFlow's one deliberate
  exception to "no backend," holding only the broker's key) applies the counter-signature and
  submits. This is the one place a transaction crosses a server at all. Full spec:
  `docs/plans/loanset-signing-service.md`. Until that's built, treat `LoanSet` as still scripted.

If the connected account lacks a precondition the protocol itself enforces (no accepted
`Credential` on a private vault's `VaultDeposit`, no shares to redeem on a `VaultWithdraw`), the
resulting `tecNO_AUTH` or similar must be surfaced on-screen as the deliberate, expected result it
is — never as a bare transaction failure. Same base-unit rule as above applies in the UI too
(`lib/format.ts`'s `eur()`/`sharePrice()`/`subtractBase()` pattern).

## Reference

- Two-party `LoanSet` signing pattern (fee-before-signing gotcha, `autofill()`'s `>=2x` base fee
  handling): `docs/snippets/loan-set-dual-sign.ts`.
- The `LoanSet` counter-signing service — TrustFlow's one deliberate exception to "no backend,"
  planned but not yet built: `docs/plans/loanset-signing-service.md`.
- Everything else — current page list, transaction hashes, phase status, demo script, pitch
  timing, deliverables — see the Source of truth list above.
