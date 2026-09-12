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

## 2. `LoanSet` pays out immediately — no drawdown step — documentation

**Category:** documentation/tutorials · **Severity:** low

The hackathon brief's own wording (Track 1 minimum bar) implies loan origination and
drawdown are separate steps. In the current XLS-66 spec, `LoanSet` transfers the
principal (minus fees) to the borrower in the same transaction — there is no separate
drawdown transaction. This is a real, easy-to-hit expectation mismatch for anyone
following the brief literally.
**Proposed fix:** update the hackathon brief's wording, or add a note to the XLS-66 spec
under `LoanSet` calling this out explicitly for readers coming from traditional lending
vocabulary where "origination" and "funding" are usually distinct events.

## 3. No `LoanTransfer` — missing primitive

**Category:** missing primitive · **Severity:** medium

The full XLS-66 transaction set (`LoanBrokerSet/Delete/CoverDeposit/CoverWithdraw/
CoverClawback`, `LoanSet/Delete/Manage/Pay`) has no way to reassign an existing `Loan` to
a different broker or lender — a `Loan` is permanently tied to the Broker+Borrower pair
that dual-signed it at creation. Any secondary market for existing debt (participation
tokens, distressed-debt resale) has to be built entirely off-protocol, wrapping a
separate token around the loan's economics rather than moving the loan itself.
**Proposed fix:** none required for a v1, but worth scoping for a future revision if
loan syndication/participation is a target use case for the protocol.

## 4. Counterparty-signed `LoanSet` fee and prefix — client libraries

**Category:** client libraries · **Severity:** low

`LoanSet`'s dual-signature flow (`sme.sign()` then `signLoanSetByCounterparty()`) needs
an explicit `Fee` set on the transaction *before* the first signature — re-autofilling
or adjusting the fee after either signature invalidates it, since the counterparty
signature covers a distinct signing prefix (`fixCleanup3_4_0`) over the whole signed
blob. This is undocumented outside the SDK's own source; a snippet in the XLS-66
reference (or the SDK's own doc comments) showing the full two-step flow end to end
would save every team hitting this the same half hour we did.
**Proposed fix:** see the bonus contribution below — we're submitting exactly that
snippet as a reusable code sample.

## 5. Hackathon faucet doesn't match the xrpl.js faucet contract — client libraries / infra

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

## 6. [reserved — filled in during the event from `docs/FRICTION.md`]

---

*This report is seeded ahead of the event with what we already know from spec research;
entries above will be corrected or dropped, and new ones added, as we actually build
against the live Custom Hackathon Devnet. Every claim here should end up backed by a
real transaction hash before submission.*
