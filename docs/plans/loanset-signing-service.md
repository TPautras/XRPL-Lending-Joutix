# Implementation plan — `LoanSet` counter-signing service

**For a coding agent picking this up cold.** Read `CLAUDE.md` first — this plan assumes its
rules (base-unit amounts, `tesSUCCESS`/engine-code checking, friction log discipline) apply here
exactly as they do everywhere else in the repo. This document is the spec; when it and the code
disagree once work has started, fix whichever is wrong and say so in the commit, the same rule
`CLAUDE.md` applies to itself.

## Why this exists

The webapp is migrating off `.env`-seed scripted signing onto connected wallets (see `CLAUDE.md`
→ "Verify first" / "Webapp signing rule"). That works cleanly for every single-signer privileged
transaction. It does not work for `LoanSet`: XLS-66's dual-signature flow needs a counter-signature
from the broker-owner, and xrpl.js's `signLoanSetByCounterparty(brokerOwner: Wallet, tx_blob)`
requires a raw `Wallet` keypair — not a signed blob — which no browser wallet extension will ever
hand the app. Confirmed by reading the extension APIs directly; not a guess.

**Decision:** rather than wait on an unverified, possibly-nonexistent extension capability, build
the smallest possible server-side service that holds the broker's key and performs exactly this
one step. This is TrustFlow's only backend. It is a deliberate, narrow exception to "no backend" —
not a first step toward a general one. See "Explicit non-goals" below before adding anything to it.

## Goal

One endpoint. Given a borrower-signed `LoanSet` blob, produce the broker's counter-signature,
submit the fully-signed transaction, and return the result — mirroring
`docs/snippets/loan-set-dual-sign.ts`'s `signAndSubmitLoanSet()` exactly, except the borrower's
half already happened in the browser before the request arrives.

## Explicit non-goals (read this before touching the service)

- **Not a general backend.** No other endpoint gets added to this service without a separate,
  explicit decision — that's the deferred "broader backend" question, and it stays deferred.
- **Holds exactly one secret**: the broker-owner's seed. Never the authority's, never any
  investor's or SME's. Those stay on wallet extensions per the existing migration.
- **Not a proxy for reads.** The webapp keeps reading `public/state.json` and the live RPC/WSS
  connection directly, per `CLAUDE.md`'s "two data sources, no third" rule. This service is
  write-path-only, for one transaction type.
- **Not part of `src/ui`'s build.** Different runtime (Node, holds a secret) from the static
  browser bundle — keep it a separate directory and a separate process, so a bug in the webapp
  can never leak into the process holding the key, and vice versa.

## Architecture

```
server/loan-signer/
  index.ts          # HTTP server entry point
  countersign.ts     # the actual signing logic — no HTTP concerns in here
  countersign.test.ts # unit test, no network/ledger calls
  tsconfig.json      # separate from src/ui's — Node target, not DOM
```

- **Runtime:** plain Node `http`/`node:http` server, or (if a router is genuinely useful for
  error handling) the smallest option available — do not pull in a full framework for one route.
- **Endpoint:** `POST /loanset/countersign`
  - Request body: `{ tx_blob: string }` — the borrower's already-signed, autofilled `LoanSet`
    blob (hex), produced client-side via the connected wallet's `sign()` (not
    `signAndSubmit()` — it must not reach the ledger before the counter-signature is applied).
  - Response, success: `{ resultCode: "tesSUCCESS", hash: string }`.
  - Response, failure: `{ resultCode: string }` with the raw engine code — per `CLAUDE.md` rule
    8, never swallow it into a generic message.
  - No other fields, no other routes.
- **Secret handling:**
  - Broker seed comes from an environment variable (`BROKER_SEED`), read once at process start
    into a `Wallet` instance, never logged, never included in any response, never written to
    disk anywhere the process touches.
  - `.env` for this service is separate from (or an added key in) the existing gitignored
    `.env` — either way, **never committed**, and note it in the repo's `.gitignore` explicitly
    if it isn't already covered.
  - CORS restricted to the known frontend origin(s) only — not `*`.
  - No further auth in this pass. This is a known, deliberate shortcut for a hackathon devnet
    demo, not an oversight — say so in a comment in `index.ts`, and log it as a friction/finding
    entry (`docs/FRICTION.md`) rather than pretending it's production-ready.

## Implementation steps, in order

1. **Write `countersign.ts` first, no HTTP, no network.** A pure function
   `countersignAndBuildSubmission(brokerWallet: Wallet, txBlob: string): string` that calls
   `signLoanSetByCounterparty` and returns the fully-signed blob. Port the logic from
   `docs/snippets/loan-set-dual-sign.ts` — do not diverge from its `Fee`/signing-order handling.
2. **Unit-test it against a fixture**, not the live ledger: a fixed test keypair (never a real
   seed) and a canned borrower-signed blob (generated once, offline, and checked in as a fixture)
   — assert the output blob is well-formed and the broker's signature is present. This must pass
   with zero network calls before step 3.
3. **Wrap it in the HTTP endpoint** (`index.ts`): parse the request, call the function from step
   1, then `client.submitAndWait()` the result, map to the response shape above. Check
   `tesSUCCESS` explicitly; surface the raw code on anything else.
4. **Wire the frontend.** In `lib/walletActions.ts` / `lib/walletTx.ts`, add the `LoanSet` path:
   connected wallet signs (not submits) the autofilled transaction, `POST` the blob to this
   service, then render the response through the same "surface the raw engine code" pattern
   every other transaction uses. Remove the "LoanSet stays a scripted flow" comment once this is
   live and correct, not before.
5. **Verify against the real devnet** — needs a human to supply the broker's seed and confirm
   devnet reachability first (`CLAUDE.md`'s "standing prerequisite" note). Don't skip step 2 to
   get here faster; a signing bug caught by a unit test is free, one caught against a live devnet
   costs a real (if test) transaction and a debugging session.
6. **Update the docs that currently describe this as unresolved**, in the same change that
   finishes it, not after:
   - `CLAUDE.md` → "Webapp signing rule": `LoanSet` moves from "genuinely open exception" to
     "signs client-side, counter-signs via the loan-signer service" — link this file.
   - `README.md`: both "no backend" lines need the one-sentence exception.
   - `docs/PROGRESS.md` → "Open risks (detail)": mark the `LoanSet` entry resolved, with a
     pointer to this file instead of the unresolved framing.

## Acceptance criteria

- [ ] `countersign.ts`'s unit test passes with no network access.
- [ ] A real `LoanSet` submitted through the webapp, using this service for the counter-signature,
      returns `tesSUCCESS` on the live devnet, reproduced at least twice (matching the rigor of
      the existing findings in `FEEDBACK_REPORT.md`, which are all reproduced on independent runs).
- [ ] The service has exactly one route and holds exactly one secret.
- [ ] `BROKER_SEED` (or wherever the seed lives) is confirmed absent from git history for any
      commit that adds this service — check before, not after, committing.
- [ ] The four doc updates in step 6 are done in the same change.

## Deferred, on purpose

The broader backend question (proxying reads, holding other keys, owning `state.json`
generation) is explicitly **not** addressed by this plan. If a real need for it shows up later,
that's a new decision and a new plan — not a natural extension of this service.
