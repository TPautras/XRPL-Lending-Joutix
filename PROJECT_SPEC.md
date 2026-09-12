# XRPL Closed-End Tokenized Credit Protocol — Build Spec

> Feed this file to your coding agent as the project brief. It defines the product, the exact on-ledger primitives to use, which amendments are required vs optional, and a phased build plan for a hackathon timeline on **XRPL Devnet**.

---

## 1. One-liner

A closed-end, fixed-term lending vehicle on XRPL — like a bond — where:
- **Lenders** buy in during a capped subscription window and receive a **tradable claim** on the pool's principal + interest.
- **Borrowers** draw fixed-term, interest-bearing credit from the pool and can **close out (buy back) their debt early**.
- Both the lender's claim and the borrower's obligation are designed to be **transferable / sellable** on-ledger wherever the protocol natively allows it, with clearly flagged custom work where it doesn't.

---

## 2. Core mapping: bond concept → XRPL primitive

| Bond concept | XRPL primitive | Amendment |
|---|---|---|
| Closed-end fund cap | `Vault.AssetsMaximum` | XLS-65 |
| Bond certificate (tradable) | Vault share = Multi-Purpose Token (MPT) | XLS-65 (uses XLS-33) |
| Coupon / interest accrual | Vault exchange-rate appreciation as loan interest repays into `AssetsTotal` | XLS-65 |
| Loan terms (rate, maturity, amortization) | `Loan` object (`InterestRate`, `PaymentInterval`, `NextPaymentDueDate`, `PaymentRemaining`, …) | XLS-66 |
| Credit enhancement / tranching | `LoanBroker` First-Loss Capital (`CoverAvailable`, `CoverRateMinimum`, `CoverRateLiquidation`) | XLS-66 |
| Early redemption / call | `CloseInterestRate`, `ClosePaymentFee` on `Loan` | XLS-66 |
| Default | `lsfLoanDefault` flag, cover liquidation | XLS-66 |
| Accredited-investor-only offering | Private vault gated by Credentials + Permissioned Domain | XLS-70, XLS-80 |
| Secondary market for the bond certificate | Vault-share MPTs traded via native order book / AMM | XLS-82, XLS-30 |
| Compliance recall | `VaultClawback`, `LoanBrokerCoverClawback` | XLS-65 / XLS-66 |

---

## 3. Environment

- **Network:** XRPL Devnet — `wss://s.devnet.rippletest.net:51233` (has `SingleAssetVault` and `LendingProtocol` amendments enabled). There is also a dedicated **Lending-Devnet** faucet if the main Devnet resets or falls behind — check `xrpl.org/resources/dev-tools/xrp-faucets` for the current URL before you start.
- **Client library:** `xrpl.js` (Node/TypeScript). Confirm you're on a version that serializes `Vault*`, `LoanBroker*`, `Loan*`, `Credential*`, `PermissionedDomain*` transactions — pin the version once confirmed working, since these are newly-added transaction types and older SDK versions may not know them.
- **Reference tutorials (read before implementing):** `xrpl.org/docs/tutorials/defi/lending/` — has working code for vault setup, deposit, loan creation, and payment.
- **Funding:** use the Devnet faucet for test XRP; if your chosen asset is an IOU or MPT (recommended over raw XRP so you can demo a stablecoin-denominated bond), you'll need to issue and distribute it yourself from an issuer account.

---

## 4. Amendments — required vs optional

All of these are confirmed enabled on the public XRPL Devnet as of this spec's writing. Re-verify with `server_info` / `feature` RPC before you build, since Devnet amendment sets do change.

### Required (core protocol)

| Amendment | Role |
|---|---|
| `SingleAssetVault` (XLS-65) | Closed-end pool + tradable share token |
| `LendingProtocol` (XLS-66, plus the `LendingProtocolV1_1` fix-patch) | Loan issuance, interest, amortization, default |
| MPTokensV1 (XLS-33) | Underlying token type for vault shares — pulled in automatically as a dependency of XLS-65 |
| Pseudo-Account (XLS-64) | Internal plumbing XLS-65/66 use to hold vault and loan-broker funds — automatic, no direct transactions needed |

### Required if you want the permissioned/institutional angle (recommended)

| Amendment | Role |
|---|---|
| Credentials (XLS-70) | On-chain KYC/accreditation attestations |
| PermissionedDomains (XLS-80) | Restricts vault deposit/withdrawal to credentialed accounts |

### Required for the secondary-market feature (see §6)

| Amendment | Role |
|---|---|
| MPT DEX Integration (XLS-82) | Lets vault-share MPTs trade on the native order book (`OfferCreate`), `Payment`, `Checks`, and AMM |
| AMM (XLS-30) | Native automated market maker — gives instant liquidity for share ⇄ stablecoin swaps instead of waiting for a counter-offer |

### Optional / nice-to-have, only if time allows

| Amendment | Role |
|---|---|
| PermissionedDEX (XLS-81) | Restricts secondary trading itself to credentialed accounts (keeps the compliance story consistent through resale) |
| Price Oracle (XLS-47) | Cross-asset valuation if you support multiple denominations |
| Clawback | Already used internally by `VaultClawback` / `LoanBrokerCoverClawback` — no separate integration work, just don't forget it exists for the compliance demo |
| TokenEscrow | Could gate the subscription window (funds held in escrow until `AssetsMaximum` is reached or a deadline passes), for a real "offering opens/closes" feel |

**Do not build:** Hooks/smart-contract functionality — not part of this Devnet, and not needed since XLS-65/66 already provide the on-ledger logic natively.

---

## 5. Design decision: one Vault per Loan (bond issue)

XLS-66 lets one `LoanBroker`/`Vault` fund many loans, which pools risk across all depositors — good for a diversified fund, but it means a single vault share is exposure to the *whole pool*, not to one specific debt.

**For this project, default to one Vault (and one LoanBroker) per bond issue = per Loan.** This makes each vault's shares a direct, specific claim on *that* loan's principal and interest — closer to a real bond issue (CUSIP-like: one instrument, one claim) and much easier to price on a secondary market, since a buyer knows exactly what credit risk they're buying. Only build the multi-loan pooled variant as a stretch goal (§9) once the single-loan version works end to end.

---

## 6. Buying/selling the interest and the debt

Be precise with your coding agent about what's **native** (a real on-ledger transaction the protocol supports) vs **custom** (application logic you build yourselves), so it doesn't go looking for a transaction type that doesn't exist.

### 6.1 Lender side — selling the interest-bearing claim (native ✅)

The vault share **is** the sellable instrument:
- Shares are MPTs, transferable by default on a public vault (or transferable-with-authorization on a private one).
- With XLS-82 + AMM, a holder can sell shares on the native order book or swap them through an AMM pool against your stablecoin/XRP at any time before maturity — no bespoke code needed, this is a direct application of standard `OfferCreate` / AMM transactions to an MPT.
- Price discovery is real: as the loan repays interest, `AssetsTotal` (and thus the share's redemption value) rises, so secondary buyers naturally price in accrued yield.

### 6.2 Borrower side — closing/buying back debt (native ✅, partially)

- **Native:** a borrower can repay early using the `CloseInterestRate` / `ClosePaymentFee` terms already defined on the `Loan` object — economically this is "buying back" the debt before maturity. Implement this via `LoanPay` with a full-payoff amount; the spec's Appendix A-3 has the exact formula for the early-close interest calculation — pull it from the current `XLS-0066-lending-protocol/README.md` when you implement, don't hardcode a guess.
- **Not native — flag as custom:** XLS-66 has no transaction for transferring the *borrower's obligation* to a different account (loan novation/assumption). There's also no native way for a third party to "buy" a specific outstanding loan the way they can buy a vault share, because the `Loan` object is not itself a transferable token — it's tied to one `Borrower` address.

### 6.3 Custom layer: making the debt itself tradable (stretch goal, design before building)

If "buy/sell the debt" needs to mean more than early repayment, you have two realistic custom approaches — pick one, don't attempt both in a hackathon window:

1. **Novation workflow (simplest):** build an app-layer flow where a new borrower pays off the outstanding `Loan` via `LoanPay` (using funds from the incoming borrower) while a *new* `Loan` is simultaneously created in their name via `LoanSet` for the same remaining terms. This needs off-ledger coordination (both parties must sign in the same atomic window — check whether `Batch` transactions are enabled on your Devnet to make this atomic; if not, accept it as two sequential transactions with a documented trust assumption).
2. **Wrapped debt token (more ambitious):** mint a separate MPT representing "right to receive this loan's repayments," redirect `LoanPay` proceeds to whoever currently holds that token, and let the token trade via XLS-82/AMM like the vault share does. This is materially more engineering — only attempt if §5–§8 are already fully working.

Document clearly in your demo which of these (if any) you implemented, since "debt trading" is easy to overstate.

---

## 7. On-ledger objects — field reference

Pull the live spec before coding (`XLS-0065-single-asset-vault/README.md` and `XLS-0066-lending-protocol/README.md` on the XRPLF/XRPL-Standards repo, `master` branch) since fields do get patched. Key fields to wire up first:

**`VaultCreate`:** `Asset`, `AssetsMaximum` (your closed-end cap), `MPTokenMetadata` (bond terms/prospectus hash), `WithdrawalPolicy`, `DomainID` (if private), `Scale`, flags `tfVaultPrivate` / `tfVaultShareNonTransferable`.

**`Vault` ledger entry (read):** `AssetsTotal`, `AssetsAvailable`, `LossUnrealized`, `ShareMPTID`, `AssetsMaximum`.

**`LoanBrokerSet`:** `VaultID`, `ManagementFeeRate`, `CoverRateMinimum`, `CoverRateLiquidation`, `DebtMaximum`.

**`LoanBroker` ledger entry (read):** `DebtTotal`, `CoverAvailable`, `OwnerCount`.

**`LoanSet`:** `PrincipalRequested`, `InterestRate`, `LateInterestRate`, `CloseInterestRate`, `OverpaymentInterestRate`, `PaymentInterval`, `GracePeriod`, `LoanOriginationFee`, `LoanServiceFee`, `LatePaymentFee`, `ClosePaymentFee`, `OverpaymentFee`.

**`Loan` ledger entry (read):** `NextPaymentDueDate`, `PaymentRemaining`, `TotalValueOutstanding`, `PrincipalOutstanding`, `PeriodicPayment`, flags `lsfLoanDefault` / `lsfLoanImpaired`.

---

## 8. User flows to implement

1. **Issuer creates the bond:** `CredentialCreate` (issuer attests investor eligibility, if using the permissioned path) → `PermissionedDomainSet` → `VaultCreate` (private, `AssetsMaximum` set) → `LoanBrokerSet`.
2. **Subscription window:** eligible investors submit `VaultDeposit`, receiving share MPTs. Reject deposits once `AssetsTotal == AssetsMaximum`.
3. **Draw-down:** once funded (or subscription window closes), broker + borrower submit `LoanSet`; principal flows to borrower.
4. **Servicing:** borrower submits `LoanPay` on schedule; vault `AssetsTotal` grows with each interest payment.
5. **Secondary sale (lender side):** holder places an `OfferCreate` (or swaps via AMM) for their share MPT against your stablecoin/XRP.
6. **Early close (borrower side):** borrower submits a full-payoff `LoanPay` using the `CloseInterestRate` terms.
7. **Default path:** broker submits `LoanManage` to mark default; First-Loss Capital liquidates per `CoverRateLiquidation`; remaining loss is socialized across `AssetsTotal` (and thus every share's value).
8. **Maturity/wind-down:** final `LoanPay`, `LoanDelete`, remaining shareholders `VaultWithdraw`, `LoanBrokerDelete`, `VaultDelete`.

---

## 9. Phased build plan

**Phase 0 — Environment:** connect to Devnet, confirm `SingleAssetVault`/`LendingProtocol` amendments via `feature` RPC, fund test accounts, issue a demo stablecoin (IOU or MPT) to use as the vault asset.

**Phase 1 — Core bond (MVP, do this first):** `VaultCreate` (public, `AssetsMaximum` set) → deposits → `LoanBrokerSet` → `LoanSet` → `LoanPay` schedule → `VaultWithdraw` at maturity. No permissioning yet. This alone demonstrates the full closed-end/fixed-term/interest-bearing thesis.

**Phase 2 — Compliance layer:** add Credentials + PermissionedDomains, convert the vault to private, gate deposits.

**Phase 3 — Secondary market (lender side):** enable XLS-82 trading of the share MPT; add an AMM pool paired against your stablecoin; build a simple UI/CLI to place/take offers.

**Phase 4 — Borrower-side close-out:** implement early full payoff using `CloseInterestRate`.

**Phase 5 (stretch) — Debt novation or wrapped debt token:** pick one approach from §6.3, document assumptions clearly.

**Phase 6 (stretch) — Multi-loan pooled vault, PermissionedDEX on resale, TokenEscrow-gated subscription window.**

### Definition of done per phase
- Phase 1: a loan can be originated, serviced to maturity, and shareholders can withdraw principal + interest.
- Phase 2: an uncredentialed account's `VaultDeposit` correctly fails.
- Phase 3: a share MPT can be sold by one test account to another via a real ledger transaction (not a mocked transfer).
- Phase 4: an early payoff correctly applies `CloseInterestRate`/`ClosePaymentFee` and closes the loan.

---

## 10. Explicit non-goals for this build

- No custom smart-contract logic (Hooks/WASM) — everything should be native XLS-65/66 transactions plus thin application code.
- No cross-chain functionality.
- No attempt at fully automated, on-chain collateral liquidation — XLS-66 is intentionally uncollateralized/off-chain-underwritten; don't try to bolt on a collateral engine unless you have significant extra time.
- Don't overstate "debt trading" in the demo unless you actually implemented one of the §6.3 approaches — early repayment is not the same claim as third-party debt purchase, and a technical judge will ask the difference.

---

## 11. References

- XLS-65 spec: `XRPLF/XRPL-Standards` → `XLS-0065-single-asset-vault/README.md`
- XLS-66 spec: `XRPLF/XRPL-Standards` → `XLS-0066-lending-protocol/README.md`
- XLS-82 spec: `opensource.ripple.com/docs/xls-82-mpt-dex`
- Tutorials: `xrpl.org/docs/tutorials/defi/lending/`
- Known amendments / live status: `xrpl.org/resources/known-amendments`

Pull the specs fresh at build time rather than trusting a cached copy — both XLS-65 and XLS-66 have been edited within the last few days as of this brief and are still marked `status: Draft`.
