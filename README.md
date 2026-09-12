# TrustFlow

**Invoice factoring + credit insurance on the XRP Ledger.** An SME ships, invoices, and waits
60–90 days to get paid. TrustFlow pays it immediately: investors pool capital in a shared
reserve, a manager decides which invoices to fund by putting their own money in first-loss, and
an insurer covers the default risk on a given loan.

Every step — deposit, loan, repayment, default, payout — is native XLS-65 (Single Asset Vault)
and XLS-66 (Lending Protocol), coupled with Credentials, a Permissioned Domain and TokenEscrow.
**No custom contracts, no backend, no server-side state.**

| | |
|---|---|
| **Hackathon** | XRPL Lending Protocol — DeVinci Blockchain × Ripple, Nanterre, 2026-09-12/13 |
| **Track / flavour** | Track 1 (open-ended vault, Lending Protocol V1) · Loaded |
| **Network** | Custom Hackathon Devnet — `rippled 3.4.0-rc1`, `network_id 4001` |
| **Library** | `xrpl@5.2.0` · React 19 + Vite 7 · Node 20+ |
| **Evidence** | [Verified transactions](#verified-on-ledger-evidence) · [Findings](#what-we-found) · [`FEEDBACK_REPORT.md`](./FEEDBACK_REPORT.md) · [`docs/FRICTION.md`](./docs/FRICTION.md) |

---

## The four roles

| Role | Does | On-ledger |
|---|---|---|
| **Investor** (A, B) | Deposits into the shared reserve, holds a share of it | `VaultDeposit` · vault shares (MPT) |
| **Manager** (broker) | Picks which invoices to fund, posts first-loss capital before lending | `LoanBrokerSet` · `LoanBrokerCoverDeposit` |
| **SME** (borrower) | Borrows against an invoice, repays on schedule | `LoanSet` (dual-signed) · `LoanPay` |
| **Insurer** | Sells default protection on one loan, locks the covered amount, keeps the premium if the loan performs | `EscrowCreate` / `EscrowFinish` / `EscrowCancel` |
| **Authority** | Issues the compliance credential the reserve requires | `CredentialCreate` · `PermissionedDomainSet` |

Share value rises mechanically as the reserve collects interest — there is no distribution
transaction, the appreciation is in the share price itself (`AssetsTotal` growth).

**The gate.** Every participant needs a `Credential` accepted by a `PermissionedDomain` before
they can deposit. **Withdrawal is deliberately left ungated** — an investor whose credential
expires must never be locked out of their own funds. That asymmetry is a ledger guarantee
(XLS-65 §7), not our leniency, and it is proven on-ledger in the [gate table](#phase-2--the-gate)
below.

---

## Quick start

```bash
npm install
cp .env.example .env

npm run probe          # Phase 0: checks the amendments are live, funds any missing role
                       # account, prints seeds to paste back into .env
npm run demo setup     # TFEUR stablecoin, credential domain, private vault, loan broker
```

Then the demo itself. **Order matters** — see the note below:

```bash
npm run demo s1        # authority issues the credentials
npm run demo s2        # investors deposit — the reserve now has liquidity
npm run demo prestage  # manager's cover, Loan B, protection sold on it
                       # prints the ledger time at which Loan B becomes defaultable (~3 min)

npm run demo s3        # ... and on through s10, the on-stage steps
npm run demo verify    # re-read every object and check the invariants
```

> [!IMPORTANT]
> **`s1` and `s2` must land before `prestage`.** A loan draws its principal from the vault, so
> `LoanSet` against a reserve nobody has deposited into is refused with `tecINSUFFICIENT_FUNDS`
> — a code that names the signer's funds when the shortfall is actually the vault's. `s1` and
> `s2` are safe to re-run live for the audience: `issueCredential()` is idempotent, and a second
> deposit simply adds more liquidity.

Other commands:

| Command | What it does |
|---|---|
| `npm run demo gate` | The Phase 2 evidence pass on its own — walks one account through every credential state (none → issued-not-accepted → accepted → revoked), records what the ledger answers at each, probes the borrow side, prints the access matrix. Idempotent, so it can be re-run for a second confirmation. |
| `npm run demo full` | `setup` → `s1` → `s2` → `prestage` → `s3`…`s10` end to end, including the real wall-clock wait for Loan B to become defaultable. A rehearsal, not the stage run. |
| `npm run demo reset` | Wipes `state/hackathon.json` only. Never touches the ledger — a fresh `setup` afterwards creates brand-new on-chain objects. |
| `npm run dev` | The read-only webapp on `localhost:5173`. |
| `npm run typecheck` | `tsc` over both the UI and the protocol scripts. |

---

## Verified on-ledger evidence

All hashes are from the live Custom Hackathon Devnet and resolve at
`https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/<hash>`.
The `/explorer` page in the webapp renders the same log, live, newest first.

### Phase 1 — the minimum bar

| Step | Transaction | Result | Hash |
|---|---|---|---|
| `setup` | `VaultCreate` | `tesSUCCESS` | `FF8DBC4548F051B1D76F9D20AA749A166D9AED8AFB38509BDB344F1F783EAE87` |
| `setup` | `LoanBrokerSet` | `tesSUCCESS` | `B952C9D3A85878B86DFA9421B0A0B8E04BF78177C502C1AE5110788096138F49` |
| `s4` | `LoanSet` (dual-signed) | `tesSUCCESS` | `C7B2620D41A46094A60A2E53527808CDE0C31F1A3A18D7AD0DE22A0F3C1CAAF2` |
| `s6` | `LoanPay` (full repayment) | `tesSUCCESS` | `B1F6E04DDCF1819656273A6414B2453C88F79844D027A1E3EB6B0D35E008DF08` |
| `s7` | `VaultWithdraw` — deliberate over-withdraw | `tecINSUFFICIENT_FUNDS` *(the point)* | `11C963A77DA075B56D0752DF5C23999F5E3C4B7418D3C6E0EE69B3FF5E55A6E3` |
| `s10` | `VaultWithdraw` | `tesSUCCESS` | `329502AA4C885AD67DA28F3F468B984A7ED3F186AC91B120D5464D482B1798C3` |

### Phase 2 — the gate

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

Three things this establishes on-ledger rather than in code:

1. **An issued-but-unaccepted credential grants nothing.** The `Credential` object exists and its
   holder is still refused, exactly as if it did not — `CredentialAccept` is load-bearing, not
   bookkeeping. Skipping it is the easiest way to build a gate that silently refuses everyone.
2. **Revocation closes the door without trapping anyone.** Refused on the way in, served on the
   way out.
3. ⚠️ **The gate does not extend to borrowing** — see [finding 2](#2-a-private-vault-gates-deposits-but-not-loans).

The on-stage step `s8` is the short version of the same thing, with the intruder funded first so
the refusal is unambiguously about the credential and not an empty balance:

| Step | Transaction | Result | Hash |
|---|---|---|---|
| `s8` | `VaultDeposit` by a **funded** uncredentialed account | `tecNO_AUTH` *(the point)* | `A7F1DEB1ADF4FD7A912AA5114F14E9553537573C2DE0168058CCCF4F820E3D27` |
| `s8` | `CredentialDelete` — an investor's credential revoked | `tesSUCCESS` | `C02CFE069D225C5E0554D8AB1B0680CFD0E089116FB404A641E4DA5D71337489` |
| `s8` | `VaultDeposit` after revocation | `tecNO_AUTH` *(the point)* | `037C701A3B549B7D5EA7573E706B643E3C6DDF4FEDC06002CCBF1DA4511C5165` |
| `s8` | `VaultWithdraw` after revocation — **still works** | `tesSUCCESS` | `AE48D99C42BF9D9F7F4A8BD4CEAD4BC748665070B98529B5B9AB2C92DD7F0359` |

### Phase 3 — the credit insurance

`prestage` sells protection on Loan B; `s5` pays a premium; once Loan B's grace period lapses,
`s9` impairs and defaults it, and the manager — the named referee holding the crypto-condition's
fulfillment — releases the escrow to the protection buyer.

| Step | Transaction | Result | Hash |
|---|---|---|---|
| `prestage` | `EscrowCreate` (insurer locks the covered amount) | `tesSUCCESS` | `8176143DD6D6F34FD90D7CA291E2DB1A4B34217B7F98574F6EC9FF24F7C1F8BD` |
| `s5` | `Payment` (premium, buyer → insurer) | `tesSUCCESS` | `F893A293EDAD84B2061F26CD49B104F1DB9DB5890C48FEB335A43BADE3D4DE6F` |
| `s9` | `LoanManage` (`tfLoanImpair`) | `tesSUCCESS` | `807EE4DF021A59A4555D1FD1CC76C081DD7164C9ED54CBF0E510CD911334EEF5` |
| `s9` | `LoanManage` (`tfLoanDefault`) | `tesSUCCESS` | `4F8324E976FCCDDA18D629446E4E53FBFC619A34C9176257AA38C62FE47A7536` |
| `s9` | `EscrowFinish` (manager reveals the fulfillment) | `tesSUCCESS` | `8C6658F773FAC83F3F0A6D869E8098D9729954DAD7E7919CB10C348D39DD7F1E` |

---

## What we found

The three headline findings, each reproducible with one command. Full write-ups, severities and
proposed fixes are in [`FEEDBACK_REPORT.md`](./FEEDBACK_REPORT.md); the raw timestamped log is
[`docs/FRICTION.md`](./docs/FRICTION.md). The `/findings` page renders the same three.

### 1. No lock can trigger on another ledger object's state

TokenEscrow releases on a time condition or a crypto-condition fulfillment — **never** on the
state of another ledger object. Credit insurance has to pay out exactly when a `Loan` is marked
defaulted by `LoanManage tfLoanDefault`, and nothing in the protocol lets an `Escrow` observe
that flag. Our workaround is a named, disclosed trusted party: the manager holds the
fulfillment and reveals it with `EscrowFinish` once they have recorded the real default
on-ledger.

**Conclusion, stated plainly: a genuinely trustless credit derivative is not buildable on XRPL
today.** What is missing is a lock that can reference another object's field — squarely in the
territory of the programmable-locks / sponsor-signing work already in progress, for which credit
insurance is a concrete motivating example. *(`FEEDBACK_REPORT.md` §1)*

### 2. A private vault gates deposits but not loans

Marking a vault private permissions the capital coming **in** and not the credit going **out**.
XLS-65 §3.5.2.2 #6 refuses a `VaultDeposit` from a non-member of the share issuance's
`PermissionedDomain`; XLS-66 §3.8.5.2 lists 24 failure conditions for `LoanSet` and none of them
consults `MPTokenIssuance(Vault.ShareMPTID).DomainID`. Its two `tecNO_AUTH` cases are
*asset-holding* authorization — a different question from domain membership.

So an account the vault refused a deposit from was handed that same vault's assets as a loan in
the very next transaction, in the same ledger state, reproduced identically on two independent
runs (`npm run demo gate`).

**This is not an exploit and we are not claiming one.** `LoanSet` is dual-signed, so the broker
must still counter-sign and nobody originates a loan unilaterally. The claim is precisely this:
with a `PermissionedDomain` configured, an uncredentialed borrower is stopped by the broker's
off-ledger discretion alone, not by the protocol. *(`FEEDBACK_REPORT.md` §2)*

### 3. `PrincipalRequested` is not scaled by the funding asset's `AssetScale`

`PrincipalRequested` is a self-describing "Number" field, not an `MPTAmount`, so the natural
reading is that it carries its own magnitude. In practice, against an MPT with `AssetScale: 2`,
`PrincipalRequested: "2000"` disbursed 2,000 **raw base units** — €20.00, 100× less than
intended — and `Loan.PrincipalOutstanding` read `"2000"` back, confirming the convention on both
sides. No error, just a loan two orders of magnitude too small. *(`FEEDBACK_REPORT.md` §7)*

### Also logged

`LoanPay tfLoanFullPayment` → `tecKILLED` on a loan's last installment (§8) · no separate
drawdown step (§3) · no `LoanTransfer`, so a `Loan` is permanently tied to the Broker+Borrower
pair that dual-signed it (§4) · the two-party `LoanSet` fee ordering, and the correction that
`autofill()` already handles it (§5) · the event faucet not matching xrpl.js's faucet contract
(§6) · `MPToken` missing from xrpl.js's `LedgerEntry` union (§9) · `five-bells-condition`'s
`PreimageSha256` silently dropping its constructor options (`docs/FRICTION.md` 18:05Z).

---

## The webapp

`npm run dev` → `localhost:5173`. React 19 + Vite, no backend, no router library: six hash routes
over a `hashchange` listener (`src/ui/lib/router.ts`), which also means the page still works from
`file://` or a stale `vite preview` if the dev server dies mid-pitch.

| Route | Page | Shows |
|---|---|---|
| `/` | Home | The problem, the four roles, the "no custom contracts" claim. Static — renders with the devnet down |
| `/dashboard` | Dashboard | Share price, `AssetsTotal`/`AssetsAvailable`, `LossUnrealized`, the cushion against `CoverRateMinimum`, both loans with their flags and grace countdown, the insurance state, and a ledger-close feed |
| `/gate` | The Gate | Every role account with its live credential state and TFEUR balance, plus the four-state access matrix with hashes |
| `/insurance` | Protection | The escrow as a diagram, its live state, and the wall — the trusted party named on screen, not implied |
| `/explorer` | Explorer | Every transaction the demo produced, newest first; deliberate refusals labelled as such, anything else counted as an unexpected failure |
| `/findings` | Findings | The three findings as cards, each with repro command, hashes and proposed fix |

**Two data sources, no third.** `public/state.json` — mirrored from `state/hackathon.json` by
`saveState()` on every write — carries the object IDs, role addresses, the last gate matrix and
the transaction log. Everything else is a live RPC query or the `ledger` subscription against
`NETWORK.wss`. If a page needs a fact in neither, the fix is to write it into the state file from
the protocol scripts, not to add a server.

**It is read-only by construction, and that is worth saying on stage:** the browser holds no key,
`LoanSet` needs two signatures, and a visitor's wallet holds no `Credential` — so a deposit from
it would land `tecNO_AUTH`, the gate working correctly but indistinguishable from a broken app.
The `xrpl-connect` widget on Home shows a connected account and nothing else.

All six routes have been walked in a browser against the live devnet: the WebSocket connects, the
ledger-close feed ticks, balances and credential states are read per account, and no page throws.

---

## Repo map

```
src/protocol/            everything that signs (Node, tsx)
  probe.ts               Phase 0 — amendments, funding, balances
  demo.ts                the step runner: setup · gate · prestage · s1..s10 · full · verify · reset
  flows/                 one file per primitive — stablecoin, domain, credentials, vault,
                         broker, loan, insurance, rejections, gate, report
  lib/                   client, wallets, submit, MPT scaling, crypto-conditions, state I/O,
                         friction logging
src/ui/                  the read-only webapp (React 19 + Vite)
  pages/ dashboard/      the six screens
  lib/                   router, shared ledger socket, state polling, formatting, evidence
state/hackathon.json     object IDs + tx log (gitignored) → mirrored to public/state.json
docs/FRICTION.md         raw, timestamped friction log
FEEDBACK_REPORT.md       the distilled developer feedback report (deliverable)
CLAUDE.md                design rationale, build order, demo script, the rules
```

### Implementation notes

**`state/hackathon.json` is the demo's own bookkeeping** — the object IDs that only exist *after*
a transaction creates them (`vaultId`, `shareMptId`, `loanBrokerId`, loan IDs, the escrow's
condition/fulfillment, the MPT issuance). Every `flows/*` function is idempotent against it: it
checks state first and returns the existing object rather than re-submitting, so `createVault()`
never creates a second vault on a re-run.

**Every transaction goes through `lib/submit.ts`**, which autofills, signs, waits for validation,
and throws unless the engine result matches what was expected (`tesSUCCESS`, or an explicit code
for the deliberate rejections in `flows/rejections.ts`). Each one prints a `✓`/`✗` line with the
raw engine code and an explorer link. The single opt-in exception is `submit(…, { record: true })`,
used only by the gate probes, where we genuinely do not know what the ledger will answer — that
*is* the experiment. It still prints its code (marked `·`), so nothing is swallowed, only
un-asserted.

**Amount handling (`lib/mpt.ts`) is the sharpest edge here.** Two conventions coexist on purpose:
`MPTAmount` fields (`VaultDeposit`/`VaultWithdraw`/`LoanPay` `Amount`, `Payment`, `EscrowCreate`)
are base units, converted from a real EUR magnitude by `mptAmount()`/`mptBaseUnits()`; Loan
"Number" fields (`PrincipalRequested`, `PrincipalOutstanding`, `TotalValueOutstanding`,
`PeriodicPayment`) turn out to be base-unit denominated too, so `flows/loan.ts` scales
`PrincipalRequested` on the way in and does *not* re-scale the others on the way out. In the UI,
`src/ui/lib/format.ts` is the only place base units become euros — string arithmetic at the
render edge, BigInt for anything derived from two ledger amounts, no float ever touching a ledger
value.

**Typings.** The UI reads the ledger through xrpl.js's own models (`import { LedgerEntry } from
'xrpl'`, then `LedgerEntry.Loan`, `LedgerEntry.LoanFlags`, the typed `vault_info` request) and
narrows on `LedgerEntryType` rather than casting. One cast survives, for `MPToken`, which is
missing from the `LedgerEntry` union.

**Friction logging (`lib/friction.ts`)** appends timestamped entries to `docs/FRICTION.md`
automatically from the rejection flows, the gate probes and a few self-checks — written the
moment something surprises us, not reconstructed afterwards.

---

## Demo cue sheet

Every step below has landed against the live devnet; the hashes are in
[Verified on-ledger evidence](#verified-on-ledger-evidence).

1. `s1` — the authority issues compliance credentials to every legitimate participant.
2. `s2` — both investors deposit into the reserve (20,000 + 15,000 TFEUR) and receive shares.
3. `s3` — the manager tops up the first-loss cushion.
4. `s4` — the SME originates Loan A (€2,000, dual-signed); the funds move immediately.
5. `s5` — the investor pays the insurance premium on the protection pre-staged for Loan B.
6. `s6` — the SME repays Loan A in full; the share price rises.
7. `s7` — **break it on purpose**: an over-withdraw past available liquidity is refused
   (`tecINSUFFICIENT_FUNDS`).
8. `s8` — the gate, two beats. A funded but uncredentialed account is refused (`tecNO_AUTH`), so
   the refusal is unambiguously about the credential. Then a real investor's credential is
   revoked: refused on the way in, still paid on the way out. Name that as a design choice and a
   ledger guarantee, not leniency.
9. `s9` — Loan B, now overdue, is impaired and then defaulted; the manager's cushion absorbs the
   loss first; the escrow releases to the protected investor. Run this against `/dashboard` —
   the cushion draining and `LossUnrealized` moving is the visual payload of the demo.
10. `s10` — investors withdraw capital plus yield, redeeming what their shares are worth *now*
    (`withdrawMax()`), which after a default is not the face value they deposited.

**Record a backup video.** Devnets reset without warning, and a live crash at 2pm costs more than
the 20 minutes it takes to film a fallback.

---

## Deliverables

- This README — project, setup, track, environment, library version, every XLS-65/66 transaction
  used, and links to verified on-ledger transactions
- [`FEEDBACK_REPORT.md`](./FEEDBACK_REPORT.md) — the developer feedback report
- [`docs/FRICTION.md`](./docs/FRICTION.md) — the raw friction log it was distilled from
- [`CLAUDE.md`](./CLAUDE.md) — design rationale, build order, and the rules this project holds
  itself to (how the findings must be worded, why the webapp never signs)

### Transactions used

| Transaction | Where |
|---|---|
| `MPTokenIssuanceCreate`, `MPTokenAuthorize`, `Payment` | `flows/stablecoin.ts` — the demo TFEUR stablecoin (`AssetScale: 2`) |
| `CredentialCreate`, `CredentialAccept`, `CredentialDelete` | `flows/credentials.ts` — the gate, issuance and revocation |
| `PermissionedDomainSet` | `flows/domain.ts` |
| `VaultCreate`, `VaultDeposit`, `VaultWithdraw` | `flows/vault.ts` — the shared reserve |
| `LoanBrokerSet`, `LoanBrokerCoverDeposit` | `flows/broker.ts` — the manager's first-loss cushion |
| `LoanSet` (dual-signed), `LoanPay`, `LoanManage` | `flows/loan.ts` — origination, repayment, impairment, default |
| `EscrowCreate`, `EscrowFinish`, `EscrowCancel` | `flows/insurance.ts` — the credit-insurance overlay |
