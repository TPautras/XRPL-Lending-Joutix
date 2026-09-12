# Bonus contribution: XLS-66 "no drawdown step" documentation fix

The simplest of CLAUDE.md's two bonus contributions. Content is ready; opening
the actual PR needs a manual step because this machine has no `gh` (GitHub CLI)
installed or authenticated, and forking a third-party repo under your GitHub
identity is exactly the kind of external, hard-to-reverse action that should get
a human's go-ahead rather than run unattended.

## What's ready

- **`loanset-no-drawdown.patch`** (same folder) — a clean diff against
  `XRPLF/XRPL-Standards@master`, `XLS-0066-lending-protocol/README.md`:
  - Fixes a typo ("transered" → "transferred") in the protocol-flow overview
    (line 49).
  - Adds a short note directly under the `### 3.8. Transaction: LoanSet`
    heading stating explicitly that `LoanSet` originates and disburses in the
    same transaction, with a pointer to the existing state-changes section that
    already proves it (§3.8.6, item 5) — so a reader coming from traditional
    lending vocabulary, where origination and funding are usually distinct
    events, doesn't have to reconstruct that from the state-change table.
- Already committed locally to a branch (`docs/loanset-no-drawdown-note`) in a
  throwaway clone of `XRPLF/XRPL-Standards` under
  `.../scratchpad/xls-standards`, on top of upstream `master`, one commit:
  `docs(XLS-0066): clarify LoanSet has no separate drawdown step`.

## What's actually documented, so this is calibrated correctly

The XLS-66 spec's own §3.8.6 (State Changes) already lists the immediate
disbursement precisely (item 5, the `Vault` pseudo-account transfer). This is
**not** a spec gap — the ledger behavior is fully specified. The gap is
readability: the human-facing overview (step 5 of the protocol flow) and the
`LoanSet` section header give no signal that this is where that atomicity is
decided, so a reader following the hackathon brief's wording (which implies a
separate drawdown step) can misread the intent without reading all the way to
§3.8.6. `FEEDBACK_REPORT.md §3` frames it the same way — low severity,
documentation category, not a protocol defect.

## To actually submit it, pick one

1. **Install `gh` and authenticate**, then:
   ```bash
   gh repo fork XRPLF/XRPL-Standards --clone=false
   git clone git@github.com:<your-username>/XRPL-Standards.git
   cd XRPL-Standards
   git checkout -b docs/loanset-no-drawdown-note
   git apply /path/to/loanset-no-drawdown.patch
   git commit -am "docs(XLS-0066): clarify LoanSet has no separate drawdown step"
   git push -u origin docs/loanset-no-drawdown-note
   gh pr create --repo XRPLF/XRPL-Standards --title "docs(XLS-66): clarify LoanSet has no separate drawdown step" --body-file <(cat <<'EOF'
   ## Summary
   - `LoanSet` disburses the requested principal to the Borrower in the same
     transaction that creates the `Loan` — there is no separate drawdown step.
     This is already fully specified in §3.8.6 (State Changes), but the
     protocol-flow overview and the `LoanSet` section header give no signal of
     it, so a reader following typical lending vocabulary (where origination and
     funding are distinct events) can miss it. Fixes a typo along the way
     ("transered" -> "transferred").
   - Found while building an invoice-factoring app on XLS-65/66 at the XRPL
     Lending Protocol hackathon (DeVinci Blockchain x Ripple, 2026-09-12/13);
     full writeup in our feedback report if useful context.

   ## Test plan
   - Documentation-only change, no code affected.
   EOF
   )
   ```
2. **Or**, if you'd rather I do it once `gh` is available: say so and I'll fork,
   push the branch above, and open the PR with the text embedded here — nothing
   else about the change will differ.
3. **Or** submit it by hand through the GitHub web UI: open
   `XRPLF/XRPL-Standards` → edit
   `XLS-0066-lending-protocol/README.md` → paste in the two hunks from
   `loanset-no-drawdown.patch` → open a PR from the fork GitHub creates for you.
