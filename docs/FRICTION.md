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

## 2026-09-12T19:20:00.000Z — xrpl.js 5.2.0, `MPToken` is missing from the `account_objects` response type

- expected: `client.request({ command: 'account_objects', account, type: 'mptoken' })` to return objects the response type can describe — `type: 'mptoken'` is one of `LedgerEntryFilter`'s documented values and `MPToken` is an exported model (`LedgerEntry.MPToken`).
- got: a TypeScript error on every field access. `AccountObject` is `Exclude<LedgerEntry, Amendments | FeeSettings | LedgerHashes>` and the `LedgerEntry` union itself does not contain `MPToken` (it has `MPTokenIssuance`), so narrowing on `object.LedgerEntryType === 'MPToken'` narrows to `never` and `MPTAmount`/`MPTokenIssuanceID` "do not exist". `tsc` even reports the comparison as having no overlap — a correct diagnosis of the union, and a misleading one about the API, since the request really does return `MPToken` objects.
- repro: any typed call reading an MPT balance, e.g. `src/ui/pages/GatePage.tsx mptBalance()` — build with `npm run typecheck`.
- note: worked around with one cast at the boundary (`result.account_objects as unknown as LedgerEntry.MPToken[]`), deliberately the only cast of its kind left in `src/ui`. Fix is one entry in the `LedgerEntry` union. Worth flagging because the same lookup is how any MPT-denominated app reads a balance, and the error message points at the narrowing rather than at the missing union member.

## 2026-09-12T19:26:00.000Z — xrpl.js 5.2.0 types all of XLS-65/66 (correcting our own assumption), but only through a namespace

- expected (our assumption while writing `src/protocol`): xrpl.js 5.2.0 would have no types for these draft amendments, so every call was written as `client.request({ ... } as never)` and every result read as `Record<string, unknown>`.
- got: it types essentially all of it. `vault_info` is in the `Request`/`Response` unions with a fully described `VaultInfoResponse` (including `vault.shares.AssetScale`), `ledger_entry`'s `result.node` is the `LedgerEntry` union, and `Loan`, `LoanBroker`, `Vault`, `Credential`, `Escrow`, `LoanFlags` and `VaultFlags` are all shipped models. The webapp's ledger reads (`src/ui/dashboard/useDashboard.ts`, `lib/protection.ts`, `pages/GatePage.tsx`) are now written with zero casts except the `MPToken` one above, narrowing on `LedgerEntryType` instead.
- note: the discoverability gap is how they are exported. `models/index.d.ts` does `export * as LedgerEntry from './ledger'`, so the models are reachable only as `import { LedgerEntry } from 'xrpl'` and then `LedgerEntry.Loan` / `LedgerEntry.LoanFlags.lsfLoanDefault` — while the name `LedgerEntry` is *also* the union type inside that namespace. `import { Loan } from 'xrpl'` fails with "Did you mean 'LoanSetFlags'?", which reads as "no such type" rather than "it is one level down". A line in the XLS-65/66 integration docs showing the namespace import would have saved us writing an entire protocol layer against `Record<string, unknown>`, and the flag enums in particular are worth advertising — we had hand-copied `0x00010000` constants for loan and credential flags that the library already exports.
## 2026-09-12T20:03:45.558Z — report.verify loan B
- expected: a defaulted loan has PaymentRemaining 0
- got: PaymentRemaining = undefined
## 2026-09-12T20:05:06.329Z — LoanSet against a private (domain-gated) vault, uncredentialed borrower
- expected: a borrower who fails the vault's PermissionedDomain check on VaultDeposit (XLS-65 §3.5.2.2 #6) is also refused the loan, or the spec says plainly that it is not
- got: tesSUCCESS — the Loan was created and vault assets were disbursed to an account with no accepted Credential
- note: XLS-66 §3.8.5.2 lists 24 failure conditions and none consults Vault.ShareMPTID's DomainID; its two tecNO_AUTH cases (#22, #23) are asset-holding authorization (MPToken/RippleState), not domain membership. Compliance-gating a vault therefore only gates the deposit side. Either LoanSet should check the domain for the Borrower, or XLS-65/66 should state explicitly that a private vault restricts depositors and not borrowers, because the natural reading of "private vault" is that both sides are permissioned. Repro, same account and same ledger state, two consecutive transactions: VaultDeposit 90CAC7210BD1755B5EC1A3579065A386D1D2861AFC30CC829EA467E4F960390A -> tecNO_AUTH, then LoanSet CD4946E11E22FA8DEE249E6081215CD2846F975F52B2FCE04A4AF624A23FA481 -> tesSUCCESS. Reproduce with `npm run demo gate`. Note the loan is dual-signed, so the broker must still counter-sign — the gap is that nothing in the protocol stops the broker from doing so.
## 2026-09-12T20:26:53.660Z — open protection market — EscrowFinish has no way to reference a Loan
- expected: a policy written by an arbitrary account could name the Loan it insures, so that releasing it depended on that Loan being in default rather than on a person publishing a secret.
- got: EscrowCreate takes a time condition or a crypto-condition and nothing else, so every policy in this market is released by a PREIMAGE-SHA-256 fulfillment the referee holds. A visitor's capital is locked behind that party's discretion: they can reveal early, or not at all, and the protocol neither prevents nor records either. The escrow cannot ask whether the Loan carries lsfLoanDefault.
- note: Documented on the /market page in the product itself rather than hidden: the referee is named on screen next to every position. Same gap as FEEDBACK_REPORT.md §1, now with third-party money behind it — which is the argument for a lock that can read another ledger object’s field.

## 2026-09-12T20:35:00.000Z — xrpl.js 5.2.0, `Escrow.Sequence` is missing from the ledger model

- expected: `LedgerEntry.Escrow` to describe the object `account_objects type=escrow` actually returns, since `EscrowFinish`/`EscrowCancel` cannot be built without one of its fields — `OfferSequence` is the sequence number of the `EscrowCreate` that made the escrow.
- got: the model has `Account`, `Destination`, `Amount`, `Condition`, `CancelAfter`, `FinishAfter`, `OwnerNode`, `DestinationNode`, `PreviousTxnID` … and no `Sequence`, while the live devnet returns `"Sequence": 74061` in every escrow object. So a typed client can read every field of an escrow except the one it needs to settle it, and has to widen the model (`LedgerEntry.Escrow & { Sequence?: number }`) to get at a value that is right there in the response.
- repro: `client.request({ command: 'account_objects', account, type: 'escrow' })` against any account holding an escrow, then try to build `EscrowFinish` from the typed result — `OfferSequence: object.Sequence` does not compile. Verified against `rippled 3.4.0-rc1`, escrow `0E8D653A…B8D0` created by `EDD623C6…731C` and finished by `EB3E1C3C…5F96`.
- note: the same lookup is the only way to discover an escrow's `OfferSequence` — it is not derivable from the object's index, and recovering it from `PreviousTxnID` costs a second round trip and is wrong for any escrow that has been modified since creation. One field added to the model fixes it. Same class of gap as the missing `MPToken` union member logged at 19:20Z: the request is supported, the response type is not.

## 2026-09-12T20:41:00.000Z — TokenEscrow, an open market makes the missing ledger-state trigger a user-facing risk

- expected: building the credit-insurance product for arbitrary participants (the `/market` page) would let a policy name the `Loan` it insures, so that releasing it depended on that loan's `lsfLoanDefault` flag rather than on a person.
- got: the same wall as `FEEDBACK_REPORT.md` §1, but now with third parties' capital behind it. Every policy in the market is an `EscrowCreate` bearing a PREIMAGE-SHA-256 condition whose preimage one named account holds; that account can publish it early, late, or never, and the ledger neither prevents nor records the choice. Two further gaps show up only once the product is open: an escrow is discoverable solely through the owner directories of the two accounts named in it (so a venue needs an off-ledger indexer for what is, on-ledger, an ordinary escrow), and a premium is an unrelated `Payment` tied to the policy by a memo convention — the escrow cannot notice a missed one.
- repro: `npm run demo referee` publishes the conditions and reveals the fulfillment for any loan the ledger says has defaulted; the market page writes, pays, claims and reclaims policies from a connected wallet. Verified end to end on the devnet: `EscrowCreate 6A9E03DE…48A0`, premium `Payment 875773F3…E1B2`, `EscrowFinish 6E2BFCAC…A419` submitted by an account that was neither the seller nor the buyer.
- note: this is the concrete motivating case for a lock that can reference another ledger object's field. Everything else about the product is native and needs no protocol change: escrows are not gated by the vault's `PermissionedDomain`, so an uncredentialed visitor can take a position — which is `FEEDBACK_REPORT.md` §2's asymmetry seen from the other side, and desirable here rather than a gap.

## 2026-09-13T00:00:00.000Z — server/loan-signer, deliberate no-auth shortcut

- expected: n/a — this is a scope decision made while building `docs/plans/loanset-signing-service.md`, logged per that plan's own instruction rather than reconstructed later.
- got: `POST /loanset/countersign` has no auth beyond restricting CORS to `FRONTEND_ORIGIN`. Anyone who can reach the service's port directly (bypassing the browser's CORS enforcement entirely — e.g. `curl`) can submit any borrower-signed `LoanSet` blob and get the broker's counter-signature applied to it. `LoanSet` is still constrained by the ledger itself (a valid `LoanBrokerID`, a borrower's own valid first signature, sufficient vault liquidity), and the broker never signs anything the borrower didn't already sign first, but the service itself does not verify who is asking.
- note: acceptable for a hackathon devnet demo behind a service the audience doesn't have the URL to, not for anything real. Flagged here rather than treated as an oversight, matching the plan's non-goals (`docs/plans/loanset-signing-service.md`): this is TrustFlow's one deliberate backend exception, not a first step toward a general, authenticated one.

## 2026-09-13T00:00:00.000Z — xrpl-connect, GemWallet custom network id is always "xrpl-custom"

- expected: connecting GemWallet (pointed, in the extension's own settings, at a manually-added custom node for this event's devnet) to `<xrpl-wallet-connector>` with `WalletManager({ network: NETWORK })` where `NETWORK.id` names this event's devnet, would succeed once the extension's custom node is configured correctly.
- got: `Failed to connect to GemWallet — Network mismatch. Expected "hackathon-devnet" but wallet is connected to "xrpl-custom"`, no matter what the extension's custom node was set to. Root cause, read directly out of the installed `xrpl-connect` build: `@gemwallet/api`'s `getNetwork()` returns `{chain: "XRPL", network: "Custom", websocket}` for any user-configured custom node — no user-assigned label, just the literal string `"Custom"` — and `GemWalletAdapter.toNetworkInfo()` builds the `NetworkInfo.id` it enforces at `connect()` as `${chain}-${network}`.toLowerCase(), i.e. always `"xrpl-custom"` verbatim, discarding the one field that actually varies (`websocket`, which the adapter does still surface as `NetworkInfo.wss`). So no `NETWORK.id` value we choose can ever match a real custom network through GemWallet except the literal string `"xrpl-custom"` itself, and the manager throws before an account is ever returned — this app's own already-built "wrong network" banner (`AccountPanel.tsx`, a soft warning by design) never even gets a chance to run.
- note: fixed by setting `NETWORK.id` to `"xrpl-custom"` so `connect()` succeeds, and moving the actual devnet-identity check from `account.networkId` to `account.networkWss` (`WalletContext.tsx`/`AccountPanel.tsx`) — `wss` is the one field GemWallet's adapter reports honestly, so it is the only reliable way to tell a visitor's wallet is really on this devnet and not some other custom node. Worth an upstream note to `xrpl-connect`: `GemWalletAdapter.toNetworkInfo()` throws away exactly the field (`websocket`) it would need to make custom-network identity meaningful, and enforces a name-collision-prone synthetic id instead.

## 2026-09-13T00:00:00.000Z — WalletConnect, confirmed unable to reach this custom devnet at all

- expected: `WalletManager({ network: NETWORK })` with `NETWORK.walletConnectId: 'xrpl:4001'` set (CAIP-2, `4001` being this devnet's real `network_id`) would let a paired WalletConnect wallet (tried: the XRPL Dev Wallet extension) connect, since that value is what xrpl-connect's own `WalletConnectAdapter` requires just to attempt pairing (see the entry above this one, same session, on the undocumented CAIP-2 requirement).
- got: pairing completed at the protocol level but the wallet's session came back on a different chain: `Network mismatch. Expected "xrpl:4001" but wallet is connected to "xrpl:0"`. The wallet ignored the requested `4001` chain and paired on `xrpl:0` (mainnet) instead — it only ever advertises the three standard CAIP-2 chains in its own session proposal, never an arbitrary custom `network_id`, and nothing on the dApp side can make it advertise one it doesn't support. So setting `walletConnectId` correctly was necessary but not sufficient, exactly as anticipated but now empirically confirmed rather than merely suspected.
- note: removed WalletConnect from this app entirely (`wallet/config.ts` no longer registers `WalletConnectAdapter`; `NETWORK.walletConnectId` removed too) rather than leave a button that can never succeed. `components/WalletConnectNotice.tsx` now says why, in place of the old "how to enable it" instructions. Upstream point worth making to whoever maintains XRPL WalletConnect wallets: there is no way for a dApp to ask "does this wallet support an arbitrary custom XRPL node," only to request a specific CAIP-2 chain and find out after pairing that it was silently substituted.

## 2026-09-13T00:00:00.000Z — GemWallet, its own popup errors on `VaultDeposit`

- expected: clicking Dashboard's deposit button would open GemWallet's sign-transaction popup with the `VaultDeposit` (`Account`, `VaultID`, `Amount: {mpt_issuance_id, value}`) our code sends, same as it already does for `LoanPay`/`LoanBrokerCoverDeposit`.
- got: GemWallet's own popup shows "We are getting this error fixed. You may want to click on this refresh button or try again later." — GemWallet's generic internal error screen, not a rejection or a ledger error, and not anything our app's own code throws (`submitFromWallet` never got a response back to reject or resolve). `TransactionType: 'VaultDeposit'` (XLS-65) is new enough, and `Amount` as an `MPTAmount` object (`{mpt_issuance_id, value}`, XLS-66's newer amount shape) uncommon enough, that GemWallet's popup — built primarily around `Payment`/trustline/NFT flows — most plausibly doesn't have a renderer for one or both and crashes internally instead of falling back to a raw-JSON view or a clear "unsupported transaction type" message.
- note: not confirmed as GemWallet's specific fault yet — reproduced only via a user report, not independently. Next step if it recurs: try the identical deposit through Crossmark (this app's `primary-wallet`, per `WalletConnector.tsx`) to isolate whether it's GemWallet-specific; if Crossmark also fails, the transaction shape itself needs a second look. Our own `VaultDeposit` construction (`dashboard/Dashboard.tsx`) matches XLS-65/66 and the base-unit rules in `CLAUDE.md` §2, so no code change made here without reproducing the actual cause first.

## 2026-09-13T00:00:00.000Z — `wallet/xrpl-connect.d.ts` is a stale hand-written ambient type for `xrpl-connect@0.8.2`, silently weakening checks against the real vendored `1.0.0-rc.2`

- expected: none of the wallet code's type errors would be masked — `xrpl-connect@1.0.0-rc.2` (vendored, per `package.json`) ships its own real `index.d.ts` (`types`/`exports.types` both point at it), including a much richer `WalletError` class (`code`, `category`, `originalError`, `toJSON()`) than a plain `{code?: string} & Error`.
- got: while adding a `console.error` of the raw wallet error object (to help debug the Crossmark/GemWallet failures above), `err.toJSON()` failed to typecheck — TypeScript was resolving `WalletManagerError` from `src/ui/wallet/xrpl-connect.d.ts`, a hand-written ambient `declare module 'xrpl-connect'` block whose own header says it exists because "`xrpl-connect@0.8.2` ships NO .d.ts". That's no longer true: the project moved to a vendored `1.0.0-rc.2` (`CLAUDE.md`'s "Verify first") that does ship real types, but this local file was never removed, so its simplified interfaces still silently shadow the real ones project-wide. Temporarily deleting it to check surfaced three real, previously-hidden type errors elsewhere: `WalletConnector.tsx`'s use of `WalletConnectorElement` as a type, and two spots in `walletTx.ts`/`WalletContext.tsx` passing `Record<string, unknown>`/`unknown[]` where the real package wants `SubmittableTransaction`/`WalletAdapter[]`.
- note: left the ambient file in place for now — properly migrating to the real vendored types touches several files and is a separate, larger task from what was asked (add logging), not a quick fix. Worked around the immediate need by logging the raw error object with plain `console.error` instead of calling `.toJSON()`, which needs no type support and shows everything at runtime regardless. Flagged to the user; worth a dedicated pass to delete `xrpl-connect.d.ts` and fix what it was hiding.

> Resolved same day, on request: deleted `src/ui/wallet/xrpl-connect.d.ts` outright and fixed every
> error the real vendored types then surfaced — `WalletConnector.tsx` now uses
> `WalletConnectorElementInstance` (the real package exports `WalletConnectorElement` as a
> constructor *value*, not a type, so casting a ref to it as a type was always wrong under
> real types); `walletTx.ts`'s three `manager.sign()`/`signAndSubmit()` calls dropped their
> `as unknown as Record<string, unknown>` casts entirely, since the real signature already
> accepts `Transaction = SubmittableTransaction` directly; `wallet/config.ts`'s
> `buildAdapters()` now returns `WalletAdapter[]`; `WalletContext.tsx` imports the real
> `WalletError` (not the stub's `WalletManagerError`) and its `onError` handler now calls the
> real, typed `err.toJSON()` instead of the runtime-only workaround above. Typecheck, build
> and smoke all pass with the ambient file gone.

## 2026-09-13T00:00:00.000Z — likely root cause found for the GemWallet `VaultDeposit` crash: no browser wallet extension is demonstrated signing XLS-65/66 transactions anywhere official

- expected: cross-referencing the event's own Notion page (and every link on it) would turn up either a known-good wallet-extension signing path for `VaultDeposit`/`LoanSet`, or an explicit note that GemWallet doesn't support them yet.
- got: neither exists, and the absence itself is the strongest signal available. The event's own official reference implementation (`ripple/xrpl-reference-app-lending-sav`, linked from the Notion page) signs everything server-side with persisted, encrypted seeds (`client.fundWallet()` → `submitAndWait({wallet, autofill: true})`) — no wallet extension anywhere in it. `xrpl.org`'s own Single Asset Vault tutorial (also linked) does the exact same thing: script-held keypair, no extension. The event further needed a specially *patched fork* of a wallet extension (`oz-ross/xrpl-dev-wallet-extension`, branch `upgrade-lending-protocol-1.1`, also linked from the Notion page) just to attempt lending-protocol support in any browser wallet at all — implying mainline GemWallet/Crossmark were never verified against these transaction types by anyone building this event's own materials.
- note: this reframes the earlier GemWallet `VaultDeposit` crash finding (above): it is very likely not a bug in this app's transaction construction (independently re-checked against XLS-65/66 and still correct) but a real, current gap in GemWallet's popup UI for rendering brand-new transaction types (`VaultDeposit`) and/or the newer `MPTAmount` amount shape. TrustFlow's own architecture deliberately chose wallet-extension signing over server-held seeds (the opposite of the reference app, on purpose — see `CLAUDE.md`'s "Webapp signing rule"), so hitting this gap is the direct, expected cost of that choice, not a sign of a mistake. Two live options if this needs to keep working live: (1) try the patched `upgrade-lending-protocol-1.1` extension branch instead of GemWallet — untested here, and it is WalletConnect-only, which this project already confirmed cannot reach a fully custom `network_id` (a separate, already-logged dead end above) unless that specific fork also changes that; or (2) accept and report this as a graded finding — a documentation/tooling gap category the event's own submission rubric explicitly asks for ("client libraries" / "missing primitive" categories in the Notion page's "Developer feedback" section) — rather than keep chasing it as an app bug.

> Narrowed further, same day: inspected the installed `@gemwallet/api@3.8.0` package directly
> (the npm wrapper `xrpl-connect`'s `GemWalletAdapter` calls). Its `signTransaction()` does
> nothing but wrap the caller's transaction object verbatim into a
> `REQUEST_SIGN_TRANSACTION/V3` postMessage to the extension's content script — no
> validation, no transformation, no allow-list of transaction types anywhere in this package
> (confirmed: no `vault`/`loan` module exists in it at all, unlike `addTrustline`,
> `createOffer`, etc., which each get their own typed wrapper). That rules out both this repo
> and `@gemwallet/api` as the fault by direct inspection, not inference: the crash can only be
> happening inside the GemWallet browser extension's own (closed-source, unpackaged here)
> popup-rendering code once it receives the message — consistent with a renderer that has a
> fixed set of transaction types/amount shapes it knows how to display and falls over instead
> of falling back to a generic view for `VaultDeposit` + `MPTAmount`. This is as precise as the
> root cause gets without the extension's own source or a live repro with its devtools open.
