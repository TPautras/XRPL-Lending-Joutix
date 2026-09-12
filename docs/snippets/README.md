# Snippets

Standalone, copy-pasteable code, decoupled from TrustFlow's own types and state —
the bonus contributions CLAUDE.md names as worth submitting beyond this project's
own report.

## `loan-set-dual-sign.ts`

The two-party `LoanSet` (XLS-66) signature flow: `signAndSubmitLoanSet()`, given a
borrower wallet, the broker owner's wallet, and the loan terms, autofills once,
signs with the borrower, counter-signs with `signLoanSetByCounterparty`, submits,
and waits for validation. Documents inline the two things that cost this project
real time (`FEEDBACK_REPORT.md §5`):

- `Fee` must be fixed before *either* signature — re-autofilling after the
  borrower signs silently invalidates it, since the counterparty signature
  covers the whole prepared blob under a distinct signing prefix
  (`fixCleanup3_4_0`).
- `xrpl.js` 5.2.0's `autofill()` already computes the `>= 2x` base fee XLS-66
  §3.8.4 requires — no need to hand-roll that math, a mistake this project
  made once before checking.

Drop the file into any project with `xrpl@5.2.0`+ as a dependency; it imports
nothing else project-specific.
