# Friction log

Append-only. One entry per surprise, the moment it happens — not reconstructed from
memory afterwards. `src/protocol/lib/friction.ts` appends here automatically from the
rejection flows and a couple of self-checks; add manual entries with the same shape
for anything you hit while building the UI, reading docs, or setting up tooling.

Format:

```
## <ISO timestamp> — <where>
- expected: <what should have happened>
- got: <what actually happened>
- note: <optional — repro, workaround, proposed fix>
```

## 2026-09-12T14:29:00.000Z — probe.ts, faucet
- expected: `client.fundWallet(wallet, {faucetHost, faucetPath})` funds the given wallet, per the standard xrpl.js faucet contract.
- got: `XRPLFaucetError: The faucet account is undefined`, even though the faucet actually funded an account. The Custom Hackathon Devnet faucet (`lending-hackathon-faucet.dev.ripplex.io/accounts`) returns `{"account":{"address":...,"secret":...}}`, but xrpl.js's `fundWallet()` reads `body.account.classicAddress` — a field this faucet never sends — so it always throws. Separately confirmed the faucet also ignores any `destination`/`address` field in the POST body and always mints a brand-new random account; there is no way to top up an existing address through it.
- note: worked around by POSTing to the faucet directly (`src/protocol/lib/faucet.ts`) and building the `Wallet` from the returned `secret`, bypassing `Client.fundWallet()` entirely. Every team using the stock xrpl.js helper against this event's faucet will hit the same misleading error.

## 2026-09-12T14:29:00.000Z — MPTokenIssuanceCreate, xrpl.js client-side validation
- expected: `MPTokenIssuanceCreate` either succeeds silently or is rejected if the metadata is malformed.
- got: a client-side warning printed to the console ("MPTokenMetadata is not properly formatted as JSON as per the XLS-89 standard... icon/i, asset_class/ac, issuer_name/in") even though the transaction still submitted and returned `tesSUCCESS`. XLS-89 (a metadata convention for MPT icons/discoverability) isn't mentioned anywhere in the XLS-33 (MPT) reference itself — it's only surfaced by xrpl.js's own validator at submit time.
- note: harmless for a hackathon demo token, but a first-time MPT issuer would reasonably wonder whether this warning means the transaction failed. A one-line cross-reference from the MPT docs to XLS-89 would remove the ambiguity.
