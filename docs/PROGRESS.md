# Progress log

Time-bound status, demo logistics, and deliverables tracking — relocated out of `CLAUDE.md` on
2026-09-13 so that file stays a short, durable set of rules instead of a journal that has to be
re-read (and paid for, in tokens) on every turn. Update this file as status changes; `CLAUDE.md`
should only change when a durable rule changes.

## Phase timeline

**Phase 0 confirmed (2026-09-12, `npm run probe`, rippled `3.4.0-rc1`, network_id 4001):** all six
required amendments live — `SingleAssetVault`, `LendingProtocol`, `Credentials`,
`PermissionedDomains`, `TokenEscrow`, `MPTokensV1`. All 8 role accounts (authority, issuer, manager,
sme, smeUncredentialed, investorA, investorB, insurer) funded with 1000 XRP via faucet; seeds in
`.env` (gitignored). Demo stablecoin (`TFEUR`) issued via `MPTokenIssuanceCreate` — issuance id in
`state/hackathon.json`.

> Note (2026-09-13): `npm run probe` / `npm run demo` and the `src/protocol/` directory they ran
> against are currently deleted in the working tree, uncommitted — an in-progress migration. See
> `CLAUDE.md`'s flux note before assuming these commands still exist.

**Phase 1 minimum bar confirmed (2026-09-12):** `setup` → `s1` (credentials) → `s2` (deposit) → `s3`
(cover) → `s4` (loan origination) → `s6` (full repayment) → `s7` (rejected over-withdraw,
`tecINSUFFICIENT_FUNDS`) → `s10` (withdrawal) all landed `tesSUCCESS` (or the expected guardrail
code) end to end on the Custom Hackathon Devnet. Bug writeups: `docs/FRICTION.md`.

**Phase 2 confirmed (2026-09-12, `npm run demo gate` + `s8`):** the gate verified on-ledger, not
just wired — full four-state credential matrix, hashes in README's Phase 2 table.

**Third major finding confirmed (2026-09-12):** a private vault gates deposits but not loans,
reproduced on two independent runs. Full writeup: `FEEDBACK_REPORT.md` §2.

**Phase 3 (the twist):** `flows/insurance.ts` was implemented but `s5`/`s9`/`prestage` had not been
exercised end to end against the live devnet as of the last `src/protocol/` snapshot. The open
protection Market page (`/market`) has since been verified end to end per README's evidence table —
reconcile this note with README.md and the current working tree, since `src/protocol/` itself is
mid-migration (see `CLAUDE.md`).

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

Live dashboard (share price, unrealized loss, cushion level, updating during the default trigger) is
the single best use of the 10%-weighted presentation score, even though it adds no ledger-technical
value on its own.

## Pitch (4 minutes)

| Time | Content |
|---|---|
| 0:00–0:30 | The problem: the SME waiting 90 days, market size |
| 0:30–1:00 | The four roles, the first-loss cushion |
| 1:00–3:00 | Live demo: full cycle, then the default with the dashboard |
| 3:00–3:30 | The credit-insurance wall and our proposal |
| 3:30–4:00 | The gate: deposits permissioned, loans not — plus one more friction point and the fixes |

Credit insurance gets ~30 seconds on stage; its weight is in the written report, not the pitch.
Backup video: needs an actual screen recording against seeded devnet accounts — see
`docs/bonus/backup-video-script.md`.

## Deliverables

- [x] Public repo with README (project, setup, track, environment, library version, every XLS-65/66
      transaction used)
- [x] Links to verified on-ledger transactions (README's evidence tables)
- [x] Slide deck, 10 slides max — drafted as an Artifact; export/attach to the final submission
- [x] Feedback report, 3 pages max, at repo root (`FEEDBACK_REPORT.md`)
- [ ] Completed developer-experience form — needs the organizer's form link
- [x] DevEx capture hook installed (`/xrpl-status`)
- [ ] Backup demo video — needs an actual screen recording of a live run against seeded devnet
      accounts

## Bonus contributions

- [x] **`LoanSet` dual-sign snippet**: `docs/snippets/loan-set-dual-sign.ts` — standalone,
      project-independent, documents the fee-before-signing gotcha and that `autofill()` already
      handles the `>= 2x` base fee (`FEEDBACK_REPORT.md` §5).
- [ ] **Drawdown-step doc PR**: patch + PR text ready in `docs/bonus/loanset-no-drawdown-pr.md` and
      `docs/bonus/loanset-no-drawdown.patch`, committed locally against a clone of
      `XRPLF/XRPL-Standards`. Not yet opened upstream — needs `gh` installed/authenticated and a
      human's go-ahead to fork a third-party repo under a personal GitHub identity.

## Open risks (detail)

Full context for the two one-line checks in `CLAUDE.md`'s "Verify first" section. Update or
delete each entry as it resolves — don't let `CLAUDE.md` accumulate this detail back.

**Signing migration is targeted, not landed — except `LoanSet`, now resolved.** `src/protocol/`
(every scripted flow, `probe.ts`, `demo.ts`) and `npm run probe` / `npm run demo` are deleted in
the working tree, uncommitted, and `xrpl-connect` is bumped to a vendored `1.0.0-rc.2` in place of
registry `0.8.2` — but nothing in `src/ui` implements the single-signer privileged-transaction
replacement yet.

Intended design, confirmed with the team: retire `.env`-seed custody entirely. Every privileged
account connects *its own* wallet in the browser when it's that account's turn, instead of a
Node script holding its seed. This resolves cleanly for the single-signer privileged
transactions — `CredentialCreate`/`CredentialDelete` (authority), `LoanBrokerSet`/`LoanManage`/
`VaultCreate` (manager as broker-owner) — since `xrpl-connect@1.0.0-rc.2`'s Crossmark and
GemWallet adapters both expose single-signer `sign()`/`signAndSubmit()`, confirmed by reading
the vendored package's `index.d.ts` directly (no multisign/custody API exists in it, nor is
one needed for these). **This part is still open** — no `src/ui` code wires it up yet.
WalletConnect is not among these: tested and confirmed unable to reach this custom devnet at
all (see below), so it's not offered as a transport for anything.

`LoanSet`'s dual-sign is done: `server/loan-signer` (spec: `docs/plans/loanset-signing-service.md`)
holds only the broker-owner's key and applies its counter-signature over an already
borrower-signed blob. `countersign.ts`'s unit test passes against a checked-in fixture with zero
network access; end-to-end, `useLoanSetSubmit()`/`submitLoanSetFromWallet()`
(`lib/walletActions.ts`/`lib/walletTx.ts`) signing client-side and POSTing to the running service
returned `tesSUCCESS` against the live devnet on two independent runs (a fresh `VaultCreate` +
`LoanBrokerSet` + `VaultDeposit`, then two separate `LoanSet`s through the service, both
`tesSUCCESS`, 2026-09-13). `CLAUDE.md` and `README.md` are updated to match.

**Devnet protocol version: BOTH V1 and V1.1 are live (checked 2026-09-13, not yet escalated).**
`curl -s $DEVNET_RPC -d '{"method":"feature"}'` shows `LendingProtocol` (V1) and
`LendingProtocolV1_1` **both** `enabled: true`, exactly the trigger condition this entry always
said meant "stop and re-derive, not guess" and "escalate to organizers immediately." That has
not happened yet — flagging it now rather than assuming it away.

What's known so far, and what isn't: a live-devnet run earlier today (`VaultCreate` →
`LoanBrokerSet` → `VaultDeposit` → two separate `LoanSet`s, all against a freshly created
**open-ended** vault) returned `tesSUCCESS` throughout — so, at minimum, *originating* a loan
against an open-ended vault is not currently blocked, which is some evidence against the
specific "new loans restricted to closed-ended vaults only" failure mode this entry warned
about. That test did not check the other half of the concern — whether accounting is
whole-life (V1) or cash-basis (V1.1) in practice on this ledger, which changes what
`AssetsTotal`/share price/broker debt metrics mean and would invalidate assumptions elsewhere
in `CLAUDE.md` even if loan origination itself keeps working. **Still needs an organizer
confirmation or a repayment-cycle test that distinguishes the two accounting models before
this is truly resolved** — do not delete this entry on the strength of the origination test
alone.

## Risks and fallbacks

| Risk | Fallback |
|---|---|
| TokenEscrow not enabled on this devnet | Insurance becomes a mock; the finding goes in the report |
| Credentials not available | Vault stays open; document the absence as a missing primitive |
| Devnet resets or is unstable | Save keys/provisioning scripts immediately; backup video ready |
| Two-party `LoanSet` signature blocks the team | Give it a dedicated slot early, not last-minute |
| The twist eats the base's time | Hard freeze: nothing new until the full base cycle runs |
