# XRPL Closed-End Tokenized Credit — Full Spec

Background and rationale. `CLAUDE.md` is the operational brief; read this file when you need
the *why*, the full amendment matrix, or the design of an unbuilt phase.

---

## 1. Product

A closed-end, fixed-term lending vehicle on XRPL — a bond:

- **Lenders** buy in during a capped subscription window and receive a **tradable claim** on the
  pool's principal + interest.
- **Borrowers** draw fixed-term, interest-bearing credit from the pool and can **close out (buy
  back) their debt early**.
- Both the lender's claim and the borrower's obligation are designed to be transferable on-ledger
  wherever the protocol natively allows it, with custom work explicitly flagged.

## 2. Bond concept → XRPL primitive

| Bond concept | XRPL primitive | Amendment |
|---|---|---|
| Closed-end fund cap | `Vault.AssetsMaximum` | XLS-65 |
| Bond certificate (tradable) | Vault share = MPT | XLS-65 (uses XLS-33) |
| Coupon / interest accrual | Vault exchange-rate appreciation as loan interest repays into `AssetsTotal` | XLS-65 |
| Loan terms (rate, maturity, amortization) | `Loan` object (`InterestRate`, `PaymentInterval`, `NextPaymentDueDate`, `PaymentRemaining`, …) | XLS-66 |
| Credit enhancement / tranching | `LoanBroker` First-Loss Capital (`CoverAvailable`, `CoverRateMinimum`, `CoverRateLiquidation`) | XLS-66 |
| Early redemption / call | `CloseInterestRate`, `ClosePaymentFee` on `Loan` | XLS-66 |
| Default | `lsfLoanDefault` flag, cover liquidation | XLS-66 |
| Accredited-investor-only offering | Private vault gated by Credentials + Permissioned Domain | XLS-70, XLS-80 |
| Secondary market for the certificate | Vault-share MPTs on native order book / AMM | XLS-82, XLS-30 |
| Compliance recall | `VaultClawback`, `LoanBrokerCoverClawback` | XLS-65 / XLS-66 |

## 3. Amendments

Re-verify with `feature` RPC before building — Devnet amendment sets change.

**Required (core):** `SingleAssetVault` (XLS-65), `LendingProtocol` (XLS-66 + `LendingProtocolV1_1`
fix-patch), `MPTokensV1` (XLS-33, pulled in as an XLS-65 dependency), `PseudoAccount` (XLS-64,
internal plumbing for vault/broker funds — no direct transactions).

**Required for the permissioned angle (Phase 2):** `Credentials` (XLS-70) for on-chain
KYC/accreditation attestations, `PermissionedDomains` (XLS-80) to restrict vault deposit/withdrawal
to credentialed accounts.

**Required for the secondary market (Phase 3):** `MPTDEX` (XLS-82) to let share MPTs trade via
`OfferCreate`/`Payment`/`Checks`/AMM, `AMM` (XLS-30) for instant share ⇄ stablecoin liquidity
instead of waiting for a counter-offer.

**Optional:** `PermissionedDEX` (XLS-81) to keep the compliance story consistent through resale;
`PriceOracle` (XLS-47) for multi-denomination valuation; `Clawback` (already used internally by
`VaultClawback`/`LoanBrokerCoverClawback` — no integration work, just remember it for the compliance
demo); `TokenEscrow` to gate the subscription window (funds escrowed until `AssetsMaximum` is hit or
a deadline passes).

## 4. Why one Vault per Loan

XLS-66 lets one `LoanBroker`/`Vault` fund many loans, pooling risk across depositors. Good for a
diversified fund, but a share is then exposure to the whole pool rather than one specific debt.

**Default to one Vault + one LoanBroker per bond issue = per Loan.** Each vault's shares become a
direct claim on *that* loan's principal and interest — CUSIP-like, one instrument, one claim — and
far easier to price on a secondary market, since a buyer knows exactly what credit risk they hold.
The multi-loan pooled variant is a stretch goal only.

## 5. Buying and selling the claim and the debt

### 5.1 Lender side — native ✅

The vault share **is** the sellable instrument. Shares are MPTs, transferable by default on a public
vault (transferable-with-authorization on a private one). With XLS-82 + AMM a holder can sell them
on the native order book or swap them through an AMM pool at any time before maturity — standard
`OfferCreate`/AMM transactions applied to an MPT, no bespoke code. Price discovery is real: as the
loan repays interest, `AssetsTotal` and therefore the share's redemption value rise, so secondary
buyers price in accrued yield.

### 5.2 Borrower side — native ✅ (partially)

Early payoff via `CloseInterestRate`/`ClosePaymentFee` is economically "buying back" the debt. Do it
with a full-payoff `LoanPay`; take the early-close interest formula from Appendix A-3 of the current
`XLS-0066-lending-protocol/README.md` rather than hardcoding a guess.

**Not native:** XLS-66 has no transaction for transferring the borrower's *obligation* to another
account (novation/assumption), and no way for a third party to buy a specific outstanding loan — the
`Loan` object is not a token, it is bound to one `Borrower` address.

### 5.3 Making the debt itself tradable — stretch, pick one

1. **Novation workflow (simplest).** App-layer flow: a new borrower pays off the outstanding `Loan`
   via `LoanPay` with incoming funds while a new `Loan` is created in their name via `LoanSet` on the
   same remaining terms. Needs off-ledger coordination — both parties sign in one atomic window.
   Check whether `Batch` is enabled on Devnet; if not, accept two sequential transactions with a
   documented trust assumption.
2. **Wrapped debt token (ambitious).** Mint a separate MPT representing "right to receive this
   loan's repayments", redirect `LoanPay` proceeds to the current holder, and let it trade via
   XLS-82/AMM like the vault share. Materially more engineering — only if Phases 1–4 are done.

Do not overstate debt trading in the demo. Early repayment is not third-party debt purchase, and a
technical judge will ask for the difference.

## 6. Full field reference

Pull the live spec before coding — fields do get patched.

- **`VaultCreate`:** `Asset`, `AssetsMaximum`, `MPTokenMetadata` (bond terms / prospectus hash),
  `WithdrawalPolicy`, `DomainID` (if private), `Scale`, flags `tfVaultPrivate`,
  `tfVaultShareNonTransferable`.
- **`Vault` entry (read):** `AssetsTotal`, `AssetsAvailable`, `LossUnrealized`, `ShareMPTID`,
  `AssetsMaximum`.
- **`LoanBrokerSet`:** `VaultID`, `ManagementFeeRate`, `CoverRateMinimum`, `CoverRateLiquidation`,
  `DebtMaximum`.
- **`LoanBroker` entry (read):** `DebtTotal`, `CoverAvailable`, `OwnerCount`.
- **`LoanSet`:** `PrincipalRequested`, `InterestRate`, `LateInterestRate`, `CloseInterestRate`,
  `OverpaymentInterestRate`, `PaymentInterval`, `GracePeriod`, `LoanOriginationFee`,
  `LoanServiceFee`, `LatePaymentFee`, `ClosePaymentFee`, `OverpaymentFee`.
- **`Loan` entry (read):** `NextPaymentDueDate`, `PaymentRemaining`, `TotalValueOutstanding`,
  `PrincipalOutstanding`, `PeriodicPayment`, flags `lsfLoanDefault`, `lsfLoanImpaired`.

## 7. User flows

1. **Issue.** `CredentialCreate` (issuer attests eligibility, permissioned path) →
   `PermissionedDomainSet` → `VaultCreate` (private, `AssetsMaximum` set, `SubscriptionDate` and
   `RedemptionDate` compressed to the demo window — see §8) → `LoanBrokerSet`.
2. **Subscription phase.** Eligible investors `VaultDeposit`, receiving share MPTs. Reject deposits
   once `AssetsTotal == AssetsMaximum`, and the ledger rejects them after `SubscriptionDate`.
3. **Draw-down (Investment phase).** Broker + borrower submit `LoanSet`; principal flows to
   borrower. The amortization schedule must finish before `RedemptionDate`.
4. **Servicing.** Borrower submits `LoanPay` on schedule; `AssetsTotal` grows with each interest
   payment.
5. **Secondary sale.** Holder places `OfferCreate` (or AMM swap) for their share MPT.
6. **Early close.** Borrower submits a full-payoff `LoanPay` under `CloseInterestRate` terms.
7. **Default.** Broker submits `LoanManage` to mark default; First-Loss Capital liquidates per
   `CoverRateLiquidation`; residual loss is socialized across `AssetsTotal` and every share's value.
8. **Wind-down.** Final `LoanPay` → `LoanDelete` → shareholders `VaultWithdraw` → `LoanBrokerDelete`
   → `VaultDelete`.

## 8. Closed-ended lifecycle — what we know and how we know it

The operational rules live in `CLAUDE.md`. This section records the evidence, because the lifecycle
is **not in any published spec** and anyone reading only the XLS-65 README will conclude it does not
exist.

Probed on 2026-09-12 against Devnet `wss://s.devnet.rippletest.net:51233`, `rippled 3.4.0-rc5`:

| Source | `SubscriptionDate` / `RedemptionDate` |
|---|---|
| Devnet `server_definitions` | present — UInt32, nth 75 and 76 |
| `ripple-binary-codec` in `xrpl@5.2.0` | present — same nths, so they serialize locally |
| `XLS-0065-single-asset-vault/README.md` @ master | **absent** — no phases, no dates, no gating |
| xrpl.org `VaultCreate` reference | **absent** — lists only Asset, Data, AssetsMaximum, MPTokenMetadata, WithdrawalPolicy, DomainID, Scale |
| xrpl.js `VaultCreate` TypeScript interface | **absent** — setting the dates requires a cast |

Two consequences worth stating plainly:

1. **The ledger is ahead of its own documentation.** Where they disagree, trust `server_definitions`
   and the actual engine result, and log the divergence in `docs/SEAMS.md`.
2. **The reject semantics are unspecified, not merely undocumented.** Devnet exposes no
   `tecVAULT_*` code, so an out-of-phase `VaultDeposit` returns some generic code —
   `tecNO_PERMISSION`, `tecEXPIRED`, `tecTOO_SOON` and `tecINVALID_UPDATE_TIME` are the candidates
   present in the enum. Which one is a question for the ledger, answered by the Phase 0 probe, not a
   thing to assume. A demo that claims "deposits are rejected in Investment" while showing a code
   that actually means something else is the kind of detail a technical judge will catch.

Dates are Ripple epoch seconds (UInt32, from 2000-01-01T00:00:00Z). Use `unixTimeToRippleTime`,
`isoTimeToRippleTime` and `rippleTimeToISOTime` from `xrpl` — all exported in 5.2.0 and verified at
runtime.

## 9. References

- XLS-65: `XRPLF/XRPL-Standards` → `XLS-0065-single-asset-vault/README.md` (`master`)
- XLS-66: `XRPLF/XRPL-Standards` → `XLS-0066-lending-protocol/README.md` (`master`)
- XLS-82: `opensource.ripple.com/docs/xls-82-mpt-dex`
- Tutorials: `xrpl.org/docs/tutorials/defi/lending/`
- Amendment status: `xrpl.org/resources/known-amendments`
- Faucets: `xrpl.org/resources/dev-tools/xrp-faucets` (Devnet, and a dedicated Lending-Devnet if
  main Devnet resets or falls behind)

Both XLS-65 and XLS-66 are `status: Draft` and were edited within days of this brief. Pull fresh at
build time; never trust a cached copy.
