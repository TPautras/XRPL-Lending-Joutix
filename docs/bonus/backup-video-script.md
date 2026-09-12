# Backup demo video — recording script

CLAUDE.md's risk table calls for a backup video because "devnets reset without
warning, and a live crash at 2pm costs more than the 20 minutes it takes to
film a fallback." This script is that 20 minutes, pre-written, so recording it
is "follow the cues" rather than "figure out what to say and click." It can't
be produced from this machine — there is no `.env`/seeds and no browser here —
it needs whoever holds the funded devnet accounts, `npm run dev` running, and a
screen recorder.

Total run time target: **4:00**, matching the pitch table in CLAUDE.md.

## Before you hit record

1. `npm run demo setup` (once — skip if already run on this environment).
2. `npm run demo prestage` **3 minutes before you plan to start recording.**
   It prints `Loan B defaultable once ledger time passes <T>` — by the time
   you reach step 9 below (roughly 2:30 into the recording, after ~3 min of
   `prestage` lead time plus talking through s1–s8), the wait will already
   have elapsed and `s9` won't stall the recording. If it hasn't, either pause
   the recording and resume once `npm run demo s9` stops printing "waiting
   ~Ns...", or cut the dead air in editing.
3. `npm run dev`, confirm `localhost:5173` loads and the WebSocket connects
   (ledger-close feed ticking on `/dashboard`).
4. Two terminal windows side by side: one for `npm run demo <step>` commands,
   one already on `localhost:5173`. Have `/`, `/dashboard`, `/gate`,
   `/insurance` ready in browser tabs so switching is a click, not a type.
5. Do a silent dry run of steps 1–10 once end to end before the take that
   counts — every step should already be idempotent/known-good from the
   README's verified-transactions table, so this is a rehearsal, not a test.

## Shot list

| Time | Screen | Say | Do |
|---|---|---|---|
| 0:00–0:30 | `/` (Home) | "An SME ships, invoices, and waits 60 to 90 days to get paid. TrustFlow pays it immediately." | Scroll the Home page's four-role summary once, no clicks yet. |
| 0:30–1:00 | `/` (Home), then switch to terminal | "Investors pool capital, a manager puts their own money first-loss before lending, an insurer covers the default risk on a given loan." | Point at the four-role table while saying it; no transaction yet. |
| 1:00–1:10 | terminal | "The authority issues compliance credentials." | Run `npm run demo s1`. |
| 1:10–1:25 | terminal | "Two investors deposit into the reserve." | Run `npm run demo s2`. |
| 1:25–1:35 | terminal | "The SME originates a loan against its invoice — funds move immediately, same transaction." | Run `npm run demo s4`. |
| 1:35–1:45 | terminal | "The investor buys protection on the other loan we staged earlier." | Run `npm run demo s5`. |
| 1:45–2:00 | terminal → `/dashboard` | "The SME repays in full. Share price rises." | Run `npm run demo s6`, then cut to `/dashboard` and point at the share-price figure moving. |
| 2:00–2:15 | terminal | "Now we break it on purpose: an over-withdraw past available liquidity." | Run `npm run demo s7` — narrate the `tecINSUFFICIENT_FUNDS` refusal appearing. |
| 2:15–2:35 | terminal → `/gate` | "An uncredentialed SME, visibly holding the money, tries to join — refused. Revoke a real investor's credential — refused on the way in, still paid on the way out. That's a design choice, a ledger guarantee, not leniency." | Run `npm run demo s8`; switch to `/gate` and show the access-matrix table with the fresh hashes. |
| 2:35–3:15 | `/dashboard` | "Loan B is now overdue. The manager's cushion absorbs the shock first, then the protection releases — investors see exactly what was lost and what was covered." | Run `npm run demo s9` in the terminal; keep `/dashboard` on screen and narrate `CoverAvailable` draining and `LossUnrealized` moving live. |
| 3:15–3:30 | `/insurance` | "TokenEscrow can't ask 'is this loan in default' — it can only release on time or a crypto-condition. The manager is a named, disclosed referee holding the fulfillment. That's the wall: a genuinely trustless credit derivative isn't buildable on XRPL today." | Show the escrow diagram and its now-released state. |
| 3:30–3:50 | terminal → `/gate` or `/findings` | "One more finding: a private vault gates deposits, not loans. `LoanSet` never checks the vault's domain — not an exploit, the broker still counter-signs, but the borrower side is stopped by off-ledger discretion alone." | Run `npm run demo s10` (investors withdraw) while saying this, or show `/findings` card #2. |
| 3:50–4:00 | `/` or `/findings` | "Every step here is native XLS-65/66. No custom contracts." | Closing frame — hold on the Home page's closing line or the Findings page. |

## After recording

- Trim any wait time around `s9` if `prestage`'s lead time didn't fully
  absorb it.
- Keep the raw take even if the live demo goes fine on stage — CLAUDE.md's
  instruction is to have this ready *before* presenting, not to use it only
  after a failure.
