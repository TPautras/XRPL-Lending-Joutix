# Seam report

Friction log. Every time two primitives meet, append an entry **as you hit it** — what was
wired together, what broke or surprised, what the ledger made awkward, what the workaround was.

Two sections: **ledger seams** (primitive ↔ primitive, the event deliverable) and **tooling
seams** (SDK/library friction encountered on the way there).

---

## Ledger seams

*None yet — Phase 0 not started.*

---

## Tooling seams

### 2026-09-12 — `xrpl-connect` ↔ React 19 + TypeScript

**Wired:** wallet connection UI for the demo app, using `xrpl-connect@0.8.2` (XRPL Commons'
framework-agnostic connector: Crossmark, GemWallet, Xaman, WalletConnect, Ledger) inside a
Vite + React 19 + TS app on Devnet.

**What surprised us:**

1. **The package ships no type declarations.** Its npm description advertises "full TypeScript
   support", and the repo is TypeScript, but the published `0.8.2` tarball is only
   `xrpl-connect.mjs`, `xrpl-connect.umd.js` and a `package.json` with no `types`/`typings`
   field and no `.d.ts` anywhere. Under `moduleResolution: bundler` every import is an
   implicit `any`. Worked around by hand-writing `src/ui/wallet/xrpl-connect.d.ts` from the
   export list in the bundle — so the types are inferred from minified JS, not from the
   authors, and can drift silently on upgrade.

2. **The React bindings are version-locked to an old xrpl.js.** There *is* a
   `@xrpl-commons/xrpl-connect-react` (provider + hooks, much nicer than hand-rolling a
   context), but it is `1.0.0-rc.0` and peer-requires `xrpl ^3.0.0 || ^4.0.0`. This project is
   pinned to `xrpl@5.2.0` because that is the version that serializes `VaultCreate` /
   `LoanSet` (CLAUDE.md → Stack). So the ergonomic path is closed to anyone building on the
   vault/lending amendments, and we fell back to stable `xrpl-connect@0.8.2` plus the
   hand-written React context the docs describe.

3. **`declare module 'react'` in a non-module `.d.ts` silently nukes `@types/react`.** The
   connector's UI is a custom element, `<xrpl-wallet-connector>`, so its tag has to be added
   to `JSX.IntrinsicElements`; React 19 scopes that namespace inside the `react` module rather
   than globally. Putting the augmentation in the same declarations file as the
   `declare module 'xrpl-connect'` block turned it into an ambient *replacement* — the symptom
   is 13 errors of the form `Module '"react"' has no exported member 'useState'`, which points
   nowhere near the cause. Fix: the augmentation lives alone in `src/ui/wallet/jsx.d.ts`, with
   a top-level `import type` to make the file a module.

4. **Registering an adapter without its credential is a trap.** `XamanAdapter` needs an API key
   and `WalletConnectAdapter` a project id. Passing a placeholder still puts the wallet in the
   modal, and it fails only once the user clicks it. `src/ui/wallet/config.ts` therefore builds
   the adapter list from env and only offers what is actually configured; Crossmark and
   GemWallet, which need no credential, are unconditional.

5. **Good surprise:** `STANDARD_NETWORKS.devnet.wss` is exactly
   `wss://s.devnet.rippletest.net:51233/`, the endpoint in CLAUDE.md, so the UI and the
   protocol scripts cannot drift onto different nodes. `network: 'devnet'` resolves correctly
   with no custom config.

6. **Bundle weight:** `xrpl-connect` pulls in a 2.1 MB `mpt_crypto` wasm module. Not a problem
   for a demo, worth knowing before anyone ships this.

7. **`autoConnect` does not silently restore a WalletConnect session — it disconnects on
   reload.** Reported by the user, then confirmed in the bundle: `WalletManager.reconnect()`
   only re-runs `connect(walletId)`; it never replays a cached account. For an injected
   wallet (Crossmark/GemWallet) that adapter call is cheap and often silent. For
   `WalletConnectAdapter.connect()` it always calls the underlying SignClient's
   `connect({requiredNamespaces})`, and per WalletConnect v2 that **always mints a fresh
   pairing request** (new URI, new `approval()`) — there is no code path that checks
   `client.session.getAll()` for an existing approved session first. On refresh nobody is
   there to scan/approve the new URI, so the reconnect never resolves (or times out and
   throws, which then clears the stored state). Checked whether a newer release fixes this
   before treating it as permanent: the project's own `CHANGELOG.md`, through the current
   `1.0.0-rc.2`+ unreleased entries, confirms it is an accepted adapter limitation rather
   than a bug — Crossmark, GemWallet, Ledger and Xaman all gained a `SupportsFetchAccount`
   silent-restore path; WalletConnect explicitly did not, and "a missing live account clears
   the manager session" is stated as intended behavior. **Consequence for this app:**
   WalletConnect (the only transport the XRPL Dev Wallet extension supports — see the entry
   above) is effectively session-per-tab; a reload always means re-pairing. The UI should say
   this instead of looking like a random disconnect.
