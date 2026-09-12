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
| `CredentialCreate`, `CredentialAccept` | `flows/credentials.ts` — the compliance gate |
| `PermissionedDomainSet` | `flows/domain.ts` |
| `VaultCreate`, `VaultDeposit`, `VaultWithdraw` | `flows/vault.ts` — the shared reserve |
| `LoanBrokerSet`, `LoanBrokerCoverDeposit` | `flows/broker.ts` — the manager's first-loss cushion |
| `LoanSet` (dual-signed), `LoanPay`, `LoanManage` | `flows/loan.ts` — origination, repayment, impairment, default |
| `EscrowCreate`, `EscrowFinish`, `EscrowCancel` | `flows/insurance.ts` — the credit-insurance overlay |

Every run prints each transaction's engine result code and an explorer link
(`https://custom.xrpl.org/lending-hackathon.dev.ripplex.io:51233/transactions/<hash>`).

## Demo cue sheet

1. `s1` — authority issues credentials to every legitimate participant.
2. `s2` — both investors deposit into the reserve.
3. `s3` — manager tops up the first-loss cushion.
4. `s4` — SME originates Loan A (dual-signed); funds move immediately.
5. `s5` — investor pays the insurance premium (protection on Loan B was pre-staged).
6. `s6` — SME repays Loan A in full; share price rises.
7. `s7` — an over-withdraw is rejected by the protocol (`tecINSUFFICIENT_FUNDS`).
8. `s8` — an uncredentialed account is rejected from depositing (`tecNO_AUTH`).
9. `s9` — Loan B (pre-staged, now overdue) is impaired, then defaulted; the manager's
   cushion absorbs the loss first; the insurance escrow pays out to the protected investor.
10. `s10` — investors withdraw capital plus yield.

## Known spec/implementation gaps (see `FEEDBACK_REPORT.md` for detail)

- Credit insurance cannot be triggered by ledger state directly — TokenEscrow only
  releases on time or a crypto-condition, so a trusted party must observe the default
  and reveal the fulfillment. No trustless credit derivative is buildable on XRPL today.
- `LoanSet` pays the borrower directly; there is no separate drawdown transaction, though
  the hackathon brief's own wording still implies one.
- XLS-66 has no `LoanTransfer` transaction — a `Loan` stays permanently tied to the
  Broker+Borrower pair that created it.
