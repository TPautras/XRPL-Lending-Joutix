# TrustFlow — developer feedback report

**Track:** 1 (open-ended vault, Lending Protocol V1) · **Flavour:** Loaded
**Environment:** Custom Hackathon Devnet (`rippled 3.4.0-rc1`) · **Library:** `xrpl@5.2.0`

This report covers friction encountered building an invoice-factoring + credit-insurance
application on XLS-65 (Single Asset Vault) + XLS-66 (Lending Protocol), coupled with
Credentials, Permissioned Domains, and TokenEscrow. Categories: client libraries, UX,
missing primitive, documentation/tutorials, other. See `docs/FRICTION.md` for the raw,
timestamped log this report was distilled from.

## 1. No way to trigger a payoff on ledger state — missing primitive

**Category:** missing primitive · **Severity:** high

TokenEscrow can only release on a time condition (`FinishAfter`/`CancelAfter`) or a
crypto-condition fulfillment (`Condition`) — never on the state of another ledger
object. Our credit-insurance product needs to pay out precisely when a specific `Loan`
is marked defaulted (`LoanManage tfLoanDefault`), but nothing in the protocol lets an
Escrow observe that. We worked around it with a named, disclosed trusted party (the
manager) who holds the crypto-condition's fulfillment and reveals it once they've
recorded the real default via `EscrowFinish`.

**Conclusion:** a genuinely trustless credit derivative is not buildable on XRPL today.
**Proposed fix:** a lock/escrow variant that can reference another ledger object's field
(e.g. a `Loan`'s `lsfLoanDefault` flag) as a release condition — this is squarely in the
territory of the programmable-locks/sponsor-signing work already underway; this use case
is a concrete, motivating example for that direction.

## 2. A private vault gates deposits but not loans — protocol / documentation

**Category:** missing primitive, borderline documentation · **Severity:** high

Marking a vault private (`lsfVaultPrivate` + `DomainID`) permissions the capital coming **in** and
not the credit going **out**. XLS-65 §3.5.2.2 #6 refuses a `VaultDeposit` from a non-member of the
share issuance's `PermissionedDomain`. XLS-66's `LoanSet` has 24 documented failure conditions
(§3.8.5.2) and none consults `MPTokenIssuance(Vault.ShareMPTID).DomainID`. Its two `tecNO_AUTH`
cases (#22 the Borrower, #23 the `LoanBroker.Owner`) are *asset-holding* authorization — does an
`MPToken`/`RippleState` exist — a different question from domain membership.

So an account the vault refuses a deposit from can still be handed that same vault's assets as a
loan.

**Repro:** `npm run demo gate`. One account, one ledger state, two consecutive transactions —
reproduced identically on two independent runs:

| | `VaultDeposit` | `LoanSet` |
|---|---|---|
| run 1 | `4727C082…020FC` → `tecNO_AUTH` | `D30EA1A1…44603` → `tesSUCCESS` |
| run 2 | `B0EF83FE…D4774` → `tecNO_AUTH` | `DD77E580…5EC1E2` → `tesSUCCESS` |

Borrower `rDyibrtuGLxhscYJ59fpV3Tq2JzZb2WZ7G` holds no `Credential` in either run; afterwards it
owns a `Loan` object and the disbursed TFEUR.

**This is not an exploit, and we are not claiming one.** `LoanSet` is dual-signed, so the broker
must still counter-sign and nobody originates a loan unilaterally. The gap is that with a
`PermissionedDomain` configured, an uncredentialed borrower is stopped by the broker's off-ledger
discretion *alone*. That is precisely the guarantee a compliance officer will not accept on trust,
and precisely why one reaches for an on-ledger domain in the first place.

**Proposed fix,** in preference order: (1) have `LoanSet` check the Borrower against the vault
share issuance's `DomainID` when `lsfVaultPrivate` is set, and add it to §3.8.5.2 as a
`tecNO_AUTH` case; or (2) if the asymmetry is deliberate, state it explicitly in both XLS-65 §3.4
and XLS-66 §3.8 — "a private vault restricts who may deposit, not who may borrow" — because the
natural reading of "private vault" is that both sides are permissioned, and nothing in either
document currently contradicts that reading.

## 3. `LoanSet` pays out immediately — no drawdown step — documentation

**Category:** documentation/tutorials · **Severity:** low

The hackathon brief's own wording (Track 1 minimum bar) implies loan origination and
drawdown are separate steps. In the current XLS-66 spec, `LoanSet` transfers the
principal (minus fees) to the borrower in the same transaction — there is no separate
drawdown transaction. This is a real, easy-to-hit expectation mismatch for anyone
following the brief literally.
**Proposed fix:** update the hackathon brief's wording, or add a note to the XLS-66 spec
under `LoanSet` calling this out explicitly for readers coming from traditional lending
vocabulary where "origination" and "funding" are usually distinct events.

## 4. No `LoanTransfer` — missing primitive

**Category:** missing primitive · **Severity:** medium

The full XLS-66 transaction set (`LoanBrokerSet/Delete/CoverDeposit/CoverWithdraw/
CoverClawback`, `LoanSet/Delete/Manage/Pay`) has no way to reassign an existing `Loan` to
a different broker or lender — a `Loan` is permanently tied to the Broker+Borrower pair
that dual-signed it at creation. Any secondary market for existing debt (participation
tokens, distressed-debt resale) has to be built entirely off-protocol, wrapping a
separate token around the loan's economics rather than moving the loan itself.
**Proposed fix:** none required for a v1, but worth scoping for a future revision if
loan syndication/participation is a target use case for the protocol.

## 5. Counterparty-signed `LoanSet` fee and prefix — client libraries

**Category:** client libraries · **Severity:** low

`LoanSet`'s dual-signature flow (`sme.sign()` then `signLoanSetByCounterparty()`) requires `Fee` to
be final *before the first signature* — re-autofilling after either party signs invalidates the
result, since the counterparty signature covers a distinct signing prefix (`fixCleanup3_4_0`) over
the whole blob. That ordering constraint is undocumented outside the SDK's source.

**Correcting our own assumption, which is the more useful half of this entry:** you do *not* have
to compute the ">= 2x base fee" (XLS-66 §3.8.4) yourself. xrpl.js 5.2.0's `autofill()` already does,
and says so on stdout; measured here, it returns `Fee: 24` for a `LoanSet` against `12` for a plain
transaction. We had set `Fee` manually believing it was required. The library behaviour is good —
the gap is that §3.8.4 says nothing about client-side support, so it is discoverable only by
reading console output.

**Proposed fix:** a snippet in the XLS-66 reference (or the SDK's doc comments) showing the two-step
flow end to end, stating both that `autofill` handles the fee and that the fee must be fixed before
signing. See the bonus contribution below — we're submitting exactly that snippet.

## 6. Hackathon faucet doesn't match the xrpl.js faucet contract — client libraries / infra

**Category:** client libraries · **Severity:** medium

`Client.fundWallet()` reads `body.account.classicAddress` from the faucet's JSON
response, but the Custom Hackathon Devnet faucet
(`lending-hackathon-faucet.dev.ripplex.io/accounts`) only ever returns
`body.account.address` — so the official SDK helper always throws
`XRPLFaucetError: The faucet account is undefined`, even on a successful funding.
Separately, the faucet ignores any `destination` field in the request and always mints
a brand-new random account; there is no way to top up an existing address through it.
**Proposed fix:** either have this event's faucet also emit `classicAddress` (a
one-line, backward-compatible fix matching the standard testnet/devnet faucets), or
document that `Client.fundWallet()` doesn't work against it so teams go straight to a
raw `fetch()` instead of losing time to a misleading error.

## 7. `LoanSet`'s `PrincipalRequested` is not scaled by `AssetScale` — protocol / documentation

**Category:** documentation/tutorials, borderline protocol · **Severity:** high

`PrincipalRequested` is a self-describing "Number" ledger field, not an `MPTAmount` — the natural
reading is that it carries its own magnitude independent of the funding asset's `AssetScale`. In
practice, for a loan funded by an MPT with `AssetScale: 2` (cents), submitting
`PrincipalRequested: "2000"` (meaning "€2,000") disbursed exactly 2,000 **raw base units** to the
borrower — €20.00, 100x less than intended. The resulting `Loan.PrincipalOutstanding` also reads
`"2000"`, confirming the field is base-unit denominated end to end, not display-unit. This makes
`TotalValueOutstanding`, `PeriodicPayment`, and (by the same convention) `LoanBroker.DebtTotal`/
`CoverAvailable` all base-unit values too.
**Repro:** `LoanSet` with `PrincipalRequested: "2000"` against an `AssetScale: 2` MPT →
`Loan.PrincipalOutstanding = "2000"` and the borrower's `MPToken.MPTAmount` increases by exactly
`2000`, not `200000`. Confirmed via `flows/loan.ts originate()`'s live-ledger check.
**Proposed fix:** state explicitly, in the XLS-66 reference next to `PrincipalRequested` (and any
other Loan "Number" amount field), that these values share the funding asset's base-unit
representation regardless of its `AssetScale` — this is exactly the kind of assumption a
first-time integrator gets wrong silently (no error, just a 100x-wrong loan) rather than loudly.

## 8. `LoanPay tfLoanFullPayment` returns an unhelpful `tecKILLED` on the last installment — client UX

**Category:** documentation/tutorials, borderline client libraries · **Severity:** medium

`LoanPay` with `tfLoanFullPayment` returns `tecKILLED` whenever `Loan.PaymentRemaining == 1` — per
XLS-66 §3.11.2, the rule is "use a regular payment for the final payment" instead. A loan created
with `PaymentTotal: 1` (a single-installment loan) is *always* at `PaymentRemaining == 1`, so
`tfLoanFullPayment` can never be used on it — only a plain, no-flag `LoanPay` for the scheduled
`PeriodicPayment` amount works, and it happens to fully settle the loan anyway since nothing remains.
**Repro:** originate a `PaymentTotal: 1` loan, then submit `LoanPay` with `tfLoanFullPayment` and
`Amount` covering `TotalValueOutstanding` → `tecKILLED`, with no message pointing at
`PaymentRemaining`.
**Proposed fix:** `tecKILLED` is reused from `OfferCreate`'s `tfFillOrKill` semantics and gives no
hint that the actual condition to check is `PaymentRemaining`; either a distinct result code for
this case, or an explicit callout in the `LoanPay` flag documentation that `tfLoanFullPayment` is
invalid on a loan's last installment, would save every team that writes a "just repay everything"
helper the same debugging cycle we hit.

---

*Every claim in this report is backed by a real transaction on the Custom Hackathon Devnet — see
the verified-transactions table in `README.md` and the raw, timestamped log in `docs/FRICTION.md`.*
