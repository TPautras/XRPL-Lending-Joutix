# TrustFlow — manual developer feedback report

**Team:** TrustFlow · **Track:** 1 (open-ended vault, Lending Protocol V1) · **Flavour:** Loaded
**Environment:** Custom Hackathon Devnet, `rippled 3.4.0-rc1`, `network_id 4001` · **Library:** `xrpl@5.2.0`
**Window covered:** 2026-09-12 → 2026-09-13

This is the hand-written companion to the two machine-assisted artefacts in this repo. It is
deliberately not a second list of protocol findings — those are in
[`FEEDBACK_REPORT.md`](./FEEDBACK_REPORT.md), distilled from the append-only
[`docs/FRICTION.md`](./docs/FRICTION.md), and every claim there is backed by a devnet transaction
hash. What follows is the part a log cannot capture: where the time actually went, which
assumptions we formed and why they were reasonable, and what we would change first if we had one
lever to pull on XLS-65/66 developer experience.

---

## 1. Onboarding: fast to a funded account, slow to a correct mental model

Getting eight funded accounts and a demo MPT stablecoin (`TFEUR`, `AssetScale: 2`) onto the devnet
took well under an hour, and amendment discovery was painless — a single `server_info` /
`feature` check confirmed all six amendments we needed (`SingleAssetVault`, `LendingProtocol`,
`Credentials`, `PermissionedDomains`, `TokenEscrow`, `MPTokensV1`) were live. That part of the
experience is good.

The cost was concentrated somewhere less expected: **forming a correct model of what the objects
mean**. XLS-65 and XLS-66 read as precise specifications for an implementer of `rippled` and much
less as integration documents. They enumerate failure conditions exhaustively (XLS-66 §3.8.5.2
lists 24 for `LoanSet` alone) but say comparatively little about the conventions an integrator must
infer — units, ordering constraints, and which client-side work the SDK already does. Our three
most expensive hours all came from that gap rather than from any bug:

- **Units.** `PrincipalRequested` is a self-describing "Number", so we read it as carrying its own
  magnitude. It does not: it is in the funding asset's base units, and a €2,000 loan submitted as
  `"2000"` against an `AssetScale: 2` asset silently disburses €20.00. No error, no warning —
  a loan two orders of magnitude too small that looks perfectly healthy on-ledger.
  (`FEEDBACK_REPORT.md` §7.)
- **Gating.** "Private vault" reads, to anyone with a compliance background, as permissioning both
  sides. It permissions deposits; `LoanSet` never consults the domain. We reproduced this twice, on
  one account in one ledger state. To be explicit, because the wording matters: **this is not an
  exploit and we are not presenting it as one** — `LoanSet` is dual-signed, so nothing is
  originated unilaterally. The finding is that an uncredentialed borrower is stopped by the
  broker's off-ledger discretion, not by the protocol. (`FEEDBACK_REPORT.md` §2.)
- **Escrow.** TokenEscrow releases on time or on a crypto-condition, never on another ledger
  object's state — so a credit-insurance payout cannot key off `lsfLoanDefault` and must name a
  trusted party. We did not discover this from the docs; we discovered it by designing a product
  around the opposite assumption. (`FEEDBACK_REPORT.md` §1.)

Each of these is a one- or two-sentence note in the spec away from costing nothing.

## 2. Error messages: correct codes, no pointer to the cause

The engine result codes are the fastest debugging signal on this surface, and we came to rely on
surfacing them raw everywhere. Two places where the code is right but unhelpful:

- `LoanPay` with `tfLoanFullPayment` on a loan at `PaymentRemaining == 1` returns `tecKILLED` —
  the same code `OfferCreate`'s `tfFillOrKill` uses. Nothing in the response points at
  `PaymentRemaining`, which is the field you have to read to know what to do differently. Any team
  writing a "just repay everything" helper hits this and loses the same cycle we did.
- `MPTokenIssuanceCreate` prints a client-side XLS-89 metadata warning and then lands
  `tesSUCCESS`. Harmless, but a first-time issuer cannot tell from the console whether the
  transaction failed, and XLS-89 is not cross-referenced from the MPT documentation.

**The generalisable ask:** for these newer transaction types, either a distinct result code or a
one-line callout in the flag documentation naming the field to inspect. The codes are accurate; the
path from code to remedy is what is missing.

## 3. Tooling: xrpl.js 5.2.0 is better than we assumed, and we paid for assuming otherwise

The single most useful thing we learned, and the entry we would most want other teams to read, is a
correction of our own mistake. We assumed a draft amendment surface would be untyped and wrote an
entire protocol layer against `Record<string, unknown>` and `as never` casts. **xrpl.js 5.2.0
already types essentially all of XLS-65/66** — `vault_info` is in the request/response unions;
`Loan`, `LoanBroker`, `Vault`, `Credential`, `Escrow`, `LoanFlags`, `VaultFlags` are shipped
models, including flag enums we had hand-copied as hex constants. They are exported through a
namespace (`import { LedgerEntry } from 'xrpl'`, then `LedgerEntry.Loan`), so the obvious
`import { Loan } from 'xrpl'` fails with *"Did you mean 'LoanSetFlags'?"* — which reads as "not
supported yet" rather than "one level down". The webapp, written after we checked, needs one cast
in total.

Likewise `autofill()` already computes `LoanSet`'s `>= 2x` base fee for a counterparty signature
and says so on stdout (`Fee: 24` vs `12` for a plain transaction). We had been setting `Fee`
manually, believing XLS-66 §3.8.4 made it our job. **The library behaviour is genuinely good DevEx;
the gap is that it is discoverable only by watching console output.** One line in the integration
docs — "autofill handles this, and the fee must be final before either party signs" — would have
saved us a full rewrite plus a subtle ordering bug, since re-autofilling after the first signature
invalidates it.

Two real type gaps remain, both the same shape (request supported, response type not):
`MPToken` is absent from the `LedgerEntry` union, so reading an MPT balance cannot describe its own
result; and `Escrow.Sequence` is missing from the model, so a typed client can read every field of
an escrow except the `OfferSequence` it needs to settle it. Each is a one-line fix.

Outside xrpl.js: `Client.fundWallet()` does not work against this event's faucet, which returns
`account.address` where the SDK reads `account.classicAddress` — so the official helper throws
`XRPLFaucetError: The faucet account is undefined` on a *successful* funding. Every team using the
stock helper hits this. And `five-bells-condition` — the library xrpl.org's own escrow tutorial
points to — ships no types and silently ignores `new PreimageSha256({ preimage })`, failing much
later with `MissingDataError`.

## 4. Environment

One operational note worth passing on: on 2026-09-13 the devnet had both Lending Protocol **V1 and
V1.1** live. We had built against V1 and had explicitly planned to stop and re-derive if this ever
happened. A quick origination test suggested loan creation on an open-ended vault still behaves,
but the V1-versus-cash-basis accounting question remained open at time of writing (tracked in
`docs/PROGRESS.md` → "Open risks"). For a timed event, **a pinned, announced protocol version, and
a broadcast when it changes, is worth more than any documentation improvement on this list.**

Separately: batch transactions being disabled after a security issue was clearly communicated and
caused us no lost time — we simply did not build on them. That is how a constraint should land.

## 5. What we would fix first

Ranked by hours saved per line of work, across all teams rather than just ours:

1. **State the base-unit convention** next to `PrincipalRequested` and every Loan "Number" amount
   field. Silent 100x errors are the worst failure mode in the set.
2. **Say explicitly whether a private vault gates borrowing**, either by having `LoanSet` check the
   domain or by documenting the asymmetry in both XLS-65 §3.4 and XLS-66 §3.8.
3. **One integration snippet for the dual-signed `LoanSet` flow** — namespace import, autofill, fee
   final before signing. We are contributing exactly this
   (`docs/snippets/loan-set-dual-sign.ts`).
4. **Three one-line library fixes**: `MPToken` in the `LedgerEntry` union, `Sequence` on the
   `Escrow` model, `classicAddress` in the hackathon faucet response.
5. **A lock that can read another ledger object's field.** This is the large one and clearly
   future work, but credit insurance is a concrete, motivating use case for the programmable-locks
   direction: without it, no default-triggered payout on XRPL can be trustless, and every such
   product must name a trusted party in its UI — which is what we did.

## 6. What worked well, said plainly

Vault share accounting is elegant: yield accrues in the share price via `AssetsTotal`, with no
distribution transaction to write, and an investor's exit price after a loss is simply what their
shares are worth now. The first-loss cover model (`LoanBrokerCoverDeposit`) expresses a real
credit structure in one transaction. The ungated `VaultWithdraw` (XLS-65 §7) is a genuinely good
design decision — an expired credential can never trap an investor's funds — and we built a UI
around demonstrating it deliberately. Credentials plus Permissioned Domains gave us a compliance
gate in an afternoon that would be a service to operate anywhere else. None of the friction above
changes the conclusion that this is a strong primitive set; the gaps are almost entirely in the
handful of sentences that would let an integrator form the right model on the first read.

---

*Raw timestamped observations: [`docs/FRICTION.md`](./docs/FRICTION.md). Distilled findings with
transaction hashes and proposed fixes: [`FEEDBACK_REPORT.md`](./FEEDBACK_REPORT.md). On-ledger
evidence tables: [`README.md`](./README.md).*
