---
summary: "Code review settings: review mode, enabled check groups and how many auto-fix attempts run before findings are escalated."
---

# Code review settings

## Parameters

- review_mode: batch
- check_spec_conformance: true
- check_correctness_security: true
- check_quality_style: true
- check_tests_docs: true
- auto_fix_attempts: 3

## Rules

### Leaf done

- Do not review the leaf now; it is reviewed together with the other leaves in `### Apply end`.

### Apply end

- If the implemented-leaves list is not empty, spawn the `spec-implementation-reviewer` subagent once, in the foreground, with every implemented leaf's id and title and pass type `batch` — not one call per leaf — and handle its result as described in `### Findings`, over the whole batch.

### Review

- Spec conformance: **gaps** (something the specification asks for is missing), **mismatches** (implemented differently in a way that changes behaviour or contradicts its intent; cosmetic naming or style differences don't count) and, in `batch` and `cross-spec-only` passes only, **cross-spec contracts**: leaves that call into, depend on or share a contract with each other (a function signature, API shape, data schema, event name or other interface) must be implemented consistently. Trace real call sites and imports with `Grep`/`Glob` across the files the given leaves touched, and flag producer/consumer mismatches, duplicated or conflicting logic that should share one source of truth, and broken assumptions one leaf's specification makes about another.
- Correctness and security: bugs, whether the code would actually work as described, unhandled edge cases and error paths, and security issues (injection, missing authorization, leaked secrets and similar).
- Quality and style: consistency with the project's existing conventions (naming, structure, patterns in neighbouring code), readability and maintainability. Don't report pure matters of taste.
- Tests and docs: load the owning sub-project's `testing.md` and `methodology.md` (their `### Implementation` subsections and `## Custom` sections) the same way as this file, check that the tests the change needs exist and match them, and that the documentation (README, CONTRIBUTING, CLAUDE.md and similar) is updated where the change requires it.

### Findings

- When the reviewer returns (first review or re-review), leaves it set to `completed` are approved; findings it marked `needs-decision` go straight to the escalation below, without auto-fixing them first; all other findings go to the fix loop.
- Fix loop: run up to 3 rounds for the review's scope (the same leaves and pass type the review was started with). Each round:
  1. Group the open findings by leaf; a cross-spec finding goes to the leaf it says should change, or to each named leaf.
  2. Resume each affected leaf's `spec-implementer` via `SendMessage`, one leaf at a time, with that leaf's findings (plus any answers the user gave at an escalation, as ground truth), telling it no user is available otherwise. If it can't be resumed, spawn a new `spec-implementer` for the leaf, telling it to read its plan with `specs_get_plan` (`id` `<leafId>`) and fix exactly these findings. A `TEST FAILURE` block stays an open finding for its leaf.
  3. Resume the same `spec-implementation-reviewer` via `SendMessage` (or spawn a new one) to re-review the same scope with the same pass type, and handle the result as above. Stop as soon as no findings are open.
  Without `SendMessage`, spawn a new implementer and reviewer each round, passing a summary of the earlier rounds' findings.
- Escalation: a leaf with findings still open after 3 rounds stays `processing`. Ask the user one question per leaf, listing its open findings, with four options:
  - **Retry:** another 3 fix rounds for this leaf, then ask again if findings are still open.
  - **Accept as is:** call `specs_set_status` with `id` `<leafId>` and `status` `completed` and record the leaf as "accepted with open findings", with those findings.
  - **Skip:** the leaf stays `processing`; record it as "skipped with open findings". Its review fixes stay uncommitted unless a gitflow rule already covered them. Continue with the next item.
  - **Stop:** record the leaf as "skipped with open findings", process no further items, skip every review not yet started, let reviews in flight settle, and finish the run.
- For a `needs-decision` finding, show the reviewer's proposed change with the options **Apply the proposed change**, **Drop this finding**, **Skip** and **Stop**; the user can type a different resolution. Answers go to the leaf's implementer as ground truth in the next fix round; a leaf whose only open findings were dropped counts as accepted as is.
- Without a user, treat the escalation answer as **Skip**, and for a `needs-decision` finding apply the reviewer's proposed change.

## Custom

_Project-specific review rules go here. Agents follow this section; the init skill never overwrites it._
