# Friction log

Append-only. One entry per surprise, the moment it happens — not reconstructed from
memory afterwards. `src/protocol/lib/friction.ts` appends here automatically from the
rejection flows (`flows/rejections.ts`), the gate probes (`flows/gate.ts`, which logs
whichever way its experiments come out), and a couple of self-checks; add manual entries
with the same shape for anything you hit while building the UI, reading docs, or setting
up tooling.

Format:

```
## <ISO timestamp> — <where>
- expected: <what should have happened>
- got: <what actually happened>
- repro: <optional — exact steps, command, and tx hashes>
- note: <optional — workaround, proposed fix, spec references>
```

Where an auto-logged entry has been expanded by hand afterwards (adding hashes, folding
in a duplicate from a second run), a blockquote at the top of the entry says so. The
observations themselves are never edited — only evidence is added.

## 2026-09-12T14:29:00.000Z — probe.ts, faucet
- expected: `client.fundWallet(wallet, {faucetHost, faucetPath})` funds the given wallet, per the standard xrpl.js faucet contract.
- got: `XRPLFaucetError: The faucet account is undefined`, even though the faucet actually funded an account. The Custom Hackathon Devnet faucet (`lending-hackathon-faucet.dev.ripplex.io/accounts`) returns `{"account":{"address":...,"secret":...}}`, but xrpl.js's `fundWallet()` reads `body.account.classicAddress` — a field this faucet never sends — so it always throws. Separately confirmed the faucet also ignores any `destination`/`address` field in the POST body and always mints a brand-new random account; there is no way to top up an existing address through it.
- note: worked around by POSTing to the faucet directly (`src/protocol/lib/faucet.ts`) and building the `Wallet` from the returned `secret`, bypassing `Client.fundWallet()` entirely. Every team using the stock xrpl.js helper against this event's faucet will hit the same misleading error.

## 2026-09-12T17:15:00.000Z — LoanSet, PrincipalRequested scale convention
- expected: `PrincipalRequested` (a self-describing "Number" ledger field, not an `MPTAmount`) would be interpreted at whatever display magnitude was submitted, independent of the funding MPT's `AssetScale` — e.g. `PrincipalRequested: "2000"` for a `AssetScale: 2` (cents) asset meaning "€2000".
- got: `LoanSet` disbursed exactly 2000 raw base units (`MPTAmount "2000"` on the borrower's `MPToken`) to the SME — i.e. €20.00, 100x less than intended. `PrincipalOutstanding` on the resulting `Loan` object also reads `"2000"`, matching the raw number 1:1. So for an MPT-denominated loan, every Loan "Number" field (`PrincipalOutstanding`, `TotalValueOutstanding`, `PeriodicPayment`, and by inference `DebtTotal`/`CoverAvailable` on the `LoanBroker`) is already expressed in the asset's base units, not its display units — `AssetScale` is not applied to these fields at all.
- note: fix was to pre-scale `PrincipalRequested` ourselves (`mptBaseUnits(realEuros)` instead of the bare string) before calling `LoanSet`, and to NOT re-scale `TotalValueOutstanding`/`PeriodicPayment` when building `LoanPay`'s `Amount` (they're already base units). This is exactly the "if this fires, the assumption is wrong" case flagged in a comment in `src/protocol/flows/loan.ts` before this was empirically confirmed — worth a documentation note on XLS-66 stating explicitly that Loan "Number" amount fields share the funding asset's base-unit representation, since the natural reading of a self-describing decimal type is that it carries its own magnitude.

## 2026-09-12T17:24:00.000Z — LoanPay, tfLoanFullPayment on the last installment
- expected: `tfLoanFullPayment` would be accepted any time `Amount` covers the loan's current `TotalValueOutstanding`, including on a loan's single/final scheduled payment.
- got: `tecKILLED`, with no message beyond the bare engine result code — the actual rule (XLS-66 §3.11.2) is that `tfLoanFullPayment` on a loan whose `Loan.PaymentRemaining == 1` is rejected outright; the spec's own guidance is "use a regular payment for the final payment" instead. A loan created with `PaymentTotal: 1` (a single-installment loan, as our demo's Loan A is) is *always* on `PaymentRemaining == 1`, so `tfLoanFullPayment` can never be used on it at all — only a plain (no-flag) `LoanPay` for `PeriodicPayment` works, which happens to fully settle it anyway since nothing remains after.
- note: `tecKILLED` is a confusing code to land on here — it's the same code `OfferCreate`'s `tfFillOrKill` uses, and nothing in the LoanPay error surface says "check PaymentRemaining"; a first-time integrator has to already know to check `PaymentRemaining` before picking a flag. Fix: `src/protocol/flows/loan.ts`'s `pay()` now checks `entry.PaymentRemaining` and silently drops `tfLoanFullPayment` on the last installment.

## 2026-09-12T14:29:00.000Z — MPTokenIssuanceCreate, xrpl.js client-side validation
- expected: `MPTokenIssuanceCreate` either succeeds silently or is rejected if the metadata is malformed.
- got: a client-side warning printed to the console ("MPTokenMetadata is not properly formatted as JSON as per the XLS-89 standard... icon/i, asset_class/ac, issuer_name/in") even though the transaction still submitted and returned `tesSUCCESS`. XLS-89 (a metadata convention for MPT icons/discoverability) isn't mentioned anywhere in the XLS-33 (MPT) reference itself — it's only surfaced by xrpl.js's own validator at submit time.
- note: harmless for a hackathon demo token, but a first-time MPT issuer would reasonably wonder whether this warning means the transaction failed. A one-line cross-reference from the MPT docs to XLS-89 would remove the ambiguity.

## 2026-09-12T15:44:18.080Z — a private vault gates deposits but not loans (`LoanSet` ignores the PermissionedDomain)

> Logged automatically by `flows/gate.ts` on two independent runs (15:44:18Z and 15:47:44Z),
> which produced identical results. The duplicate auto-entry has been folded into this one;
> both runs' transaction hashes are cited below.

- expected: a borrower that the vault's `PermissionedDomain` check refuses on `VaultDeposit` (XLS-65 §3.5.2.2 #6) is also refused the loan — or, failing that, the spec says plainly that it is not.
- got: `tesSUCCESS`. The `Loan` object was created and vault assets were disbursed to an account holding no accepted `Credential`. The same account, in the immediately preceding transaction and the same ledger state, was refused `VaultDeposit` with `tecNO_AUTH`.
- repro: `npm run demo gate`. Two consecutive transactions, one account, one ledger state:

  | run | `VaultDeposit` | `LoanSet` |
  |---|---|---|
  | 1 | `4727C0825DCE0DE304C128041EF9D20F1AB761004D9870A79EDB06678D2020FC` → `tecNO_AUTH` | `D30EA1A153CDB1B92E04373643AF12486DC3F95D37B4F6F0FE2F55B25C644603` → `tesSUCCESS` |
  | 2 | `B0EF83FE333241766DF49BE93CF88F739E6ADC91177ED70855FA38A636DD4774` → `tecNO_AUTH` | `DD77E5807DC4D052530238268687EB33BA812504C860A26794088565FE5EC1E2` → `tesSUCCESS` |

  Borrower `rDyibrtuGLxhscYJ59fpV3Tq2JzZb2WZ7G`, vault `8B3F561021ED6688FEF0FEAEE21350EA35D1707CD96F0ABCEEBEBC3B04CE7261` (`lsfVaultPrivate`, `DomainID 7BA4DDFA…5739A`). After each run the borrower owns a `Loan` object and the disbursed TFEUR.
- note: XLS-66 §3.8.5.2 lists 24 failure conditions for `LoanSet` and none consults `MPTokenIssuance(Vault.ShareMPTID).DomainID`. Its two `tecNO_AUTH` cases (#22 "the Borrower is not authorized for the asset", #23 the same for `LoanBroker.Owner`) are *asset-holding* authorization — an `MPToken`/`RippleState` existing — which is a different question from domain membership. So marking a vault private permissions the capital coming **in** and not the credit going **out**.

  This is not an exploit: `LoanSet` is dual-signed, so the broker must still counter-sign, and no one can originate a loan unilaterally. The gap is that with the domain configured, an uncredentialed borrower is stopped by the broker's off-ledger discretion alone — which is exactly the guarantee a compliance officer will not accept on trust, and the reason one would have reached for a `PermissionedDomain` in the first place.

  Proposed fix, in preference order: (1) have `LoanSet` check the Borrower against `Vault.ShareMPTID`'s `DomainID` when `lsfVaultPrivate` is set, and add it to §3.8.5.2 as a `tecNO_AUTH` case; or (2) if the asymmetry is intentional, say so explicitly in both XLS-65 §3.4 and XLS-66 §3.8 — "a private vault restricts who may deposit, not who may borrow" — because the natural reading of "private vault" is that both sides are permissioned, and nothing currently contradicts that reading.

## 2026-09-12T15:52:00.000Z — `LoanSet` fee autofill (positive: this one works)

- expected: based on XLS-66 §3.8.4 and the dual-signature requirement, that we would have to compute the ">= 2x base fee for a counterparty-signed `LoanSet`" ourselves and set `Fee` manually before either party signs — which is what `flows/loan.ts` and `flows/gate.ts` both do (`prepared.Fee = '200'`).
- got: xrpl.js 5.2.0's `client.autofill()` already handles it, and says so: it prints "For LoanSet transaction the auto calculated Fee accounts for total number of signers the counterparty has to avoid transaction failure." Measured on this devnet: `autofill` returns `Fee: 24` for a `LoanSet` against `Fee: 12` for a plain `AccountSet` — exactly the 2x the spec asks for.
- note: worth writing down because the two-party `LoanSet` flow is the most predictable time sink at this event and "did I set the fee high enough?" is one of the first things that goes wrong. The answer is that you do not have to: autofill before signing, and leave `Fee` alone. Our explicit `'200'` is belt-and-braces left over from before this was measured — harmless (it only overpays ~8x on a devnet) but unnecessary. The console message is genuinely good DevEx; the gap is that XLS-66 §3.8.4 says nothing about client-side support, so you only discover it by watching stdout.

## 2026-09-12T18:05:00.000Z — five-bells-condition, `PreimageSha256` constructor silently ignores its options object

- expected: `new PreimageSha256({ preimage })` — the pattern our own type shim (`src/protocol/types/five-bells-condition.d.ts`) declared — would construct a hashlock condition ready to use, matching the shape of most crypto-condition examples that pass constructor options.
- got: `MissingDataError: Could not calculate hash, no preimage provided`, thrown later inside `getConditionBinary()`/`serializeBinary()`, not at construction time. Reading the library source (`five-bells-condition/src/types/preimage-sha256.js`): `PreimageSha256` takes no constructor arguments at all: the base `Fulfillment` constructor takes none, so `{ preimage }` is accepted syntactically by TypeScript (our own `.d.ts` said it was fine) and then silently dropped at runtime. The preimage must be set explicitly via `f.setPreimage(preimage)` after construction.
- repro: `npm run demo prestage` — `sellProtection()` in `flows/insurance.ts` called `newCondition()` in `lib/condition.ts`, which built the condition with `new PreimageSha256({ preimage })`. Loan B's `LoanSet` (`04EA23DD8AE410963F37EE6C89F32335DEA1833720C1F15077037E39EED44F71`) had already landed `tesSUCCESS` moments earlier; the crash was purely in the escrow-condition step that followed.
- note: `five-bells-condition` ships no types at all (hence our hand-written shim), and its README/examples elsewhere in the ecosystem tend to show the same `{ preimage }`-in-constructor shape for the *fulfillment* wrapper types, which do accept it — `PreimageSha256` itself does not. Since this library is the one xrpl.org's own Escrow/crypto-conditions tutorial points to for generating `Condition`/`Fulfillment` hex, a wrong mental model formed here is easy to carry into any TokenEscrow integration, XRPL-specific or not. Fixed by calling `f.setPreimage(preimage)` explicitly and correcting the type shim to require it.
## 2026-09-12T17:06:07.243Z — report.verify loan B
- expected: a defaulted loan has PaymentRemaining 0
- got: PaymentRemaining = undefined
## 2026-09-12T17:08:08.894Z — report.verify loan B
- expected: a defaulted loan has PaymentRemaining 0
- got: PaymentRemaining = undefined
