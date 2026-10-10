---
name: apply
description: >-
  Use when a prepared specification (or subtree) should be planned, implemented,
  reviewed and committed leaf by leaf.
allowed-tools: 'Agent, SendMessage, AskUserQuestion, Skill, Bash'
argument-hint: '[spec_id_or_name]'
---
Drive a specification subtree from prepared to completed: plan, implement and review its leaves one at a time in dependency order, complete the intermediate specifications as their subtrees finish, and finally complete the root, running the project's git workflow and code review at the hooks named below.

## Arguments

- `$1`: the root specification's id or (partial) title. Other skills invoke this skill with the id only, also under their `--auto-apply`.

## Repositories

- **The run's git repositories** are the project root plus every repository path in the `## Sub-projects` table of `settings/SETTINGS.md`, kept only where `git -C <path> rev-parse --show-toplevel` succeeds and deduplicated by that toplevel (a sub-project that is a plain package resolves to its enclosing repository).
- Each repository follows the `gitflow.md` of the sub-project whose repository path is the longest `path/` prefix of (or equal to) its path, else the root `settings/gitflow.md`. Every gitflow step runs independently in each repository; a repository whose git operations were stopped or aborted is skipped by every later gitflow step.
- **A leaf's files** are derived from git; nothing is stored in Athenode. The leaf's baseline is the output of `git -C <repo> status --porcelain` in every repository, taken before the leaf is implemented and kept in the run's context only. **A leaf's files** are the paths that `git -C <repo> status --porcelain` reports as changed or new compared with that baseline, made relative to the project root, plus the files outside every repository that `atn:spec-implementer` reports. Recompute the set after every `atn:spec-implementer` return (the first run and every retry or resume for review fixes), keeping the paths found earlier, since a commit takes them out of the status; a path already dirty at the baseline is not the leaf's. Each file belongs to the repository with the longest matching toplevel; files outside every repository are never staged. Whenever `atn:spec-implementation-reviewer` is spawned or resumed, pass it each reviewed leaf's files, since the working tree may already be committed by then.
- A leaf **touched a repository** when `git -C <repo> status --porcelain -- <its files there>` reports one of them as changed. The repositories a leaf's plan predicts it will touch are those its `Affected sub-projects` section (`specs_get_plan` with the leaf id) maps to through the sub-project table.
- **The implemented-leaves list** holds `{id, title}` of every leaf implemented without a `TEST FAILURE` in this run; the code-review.md Rules subsections review it.
- **A leaf's review has settled** when the leaf is `completed` or skipped, or the run was stopped.

## Flow

The run is unattended except at its ask points: a loaded Rules subsection says to ask, the planner is blocked (step 5.2), an implementer reports a `TEST FAILURE` (step 5.4), there are external blockers (step 3.7), or out-of-scope items are left to turn into ToDo cards (step 8); the last two are asked even when another skill started this one under `--auto-apply`. Everywhere else decide with your own best judgment, and stop with a clear report on ambiguity that can't be resolved safely. Only this skill runs state-changing git commands, and only where a gitflow.md Rules subsection says so; if one fails and the subsection doesn't say what to do, stop git operations in that repository for the rest of the run, report why and continue without git there. No ToDo card is created before step 8, and only this skill creates one; subagents only return out-of-scope items. Tell every subagent that no user is available and that it never creates a ToDo card, passing answers the user gave at an ask point as ground truth.

1. Work out the run's git repositories, then load each repository's `gitflow.md` (`### Apply start`, `### Leaf done`, `### Review approved`, `### Apply end`) and the root `settings/code-review.md` (`### Leaf done`, `### Apply end`, `### Findings`), which drives the review loop for the whole run. A missing file or subsection skips the step it drives.
2. Resolve `$1` to the root id:
   - If `$1` is missing, report that an explicit id or title is required and stop.
   - If it is a UUID, use it.
   - Otherwise call `specs_search` with `query` `$1`. With no hit, report that nothing matched and stop; with one, use its id; with several, report the candidates (id and title) and stop, asking for an explicit id.
3. Fetch the execution plan, before the root is marked `processing`, so a stop here leaves it unchanged:
   1. Read the root with `specs_get`.
   2. Call `specs_tree` with `id` = the root id and `executionOrder` `true`, once, also for a root without children (the only source of the root's own blockers). Keep its `tree` and `plan`.
   3. If `plan.cycle` is set, report its specifications (title and id, in order) and stop, changing no status.
   4. If `plan.order` is empty, report that nothing under the root is `prepared` or `processing` (for a root without children, that it isn't prepared) and stop.
   5. If a leaf's `internalBlockers` entry that is in `plan.order` doesn't come earlier in it, or one that isn't in `plan.order` is missing from `plan.unpreparedInternalBlockers`, report the inconsistency (a backend bug) and stop.
   6. For each `plan.unpreparedInternalBlockers` entry, add its `blockedLeafIds` to the skipped set, with the reason "<leaf> is blocked by <blocker title> (<blocker id>, <status>)".
   7. If `plan.externalBlockers` is not empty, ask, listing per blocker its title, id, status, `path` titles joined with " / " and the titles of its `blockedLeafIds`:
      - **Stop**: report the external blockers and stop without changing any status.
      - **Run only the leaves not blocked by external blockers**: add every blocker's `blockedLeafIds` to the skipped set with the same reason. A blocker on the root or on an ancestor inside the branch blocks every leaf; then say plainly that nothing runs.
   8. If every leaf in `plan.order` is skipped, report that with the reasons and stop.
   9. Otherwise set the root `processing` with `specs_set_status`. The run list is `plan.order` minus the skipped set, in plan order; leaves already `processing` from an interrupted run go through the same flow and are re-planned.
   10. Seed a status map from `tree` (every node's id, status, parent and children) and keep it current for the rest of the run.
4. Follow gitflow.md `### Apply start` in every repository.
5. For each leaf in the run list, in order:
   1. If it has meanwhile been added to the skipped set, record it as skipped and go on with the next leaf.
   2. Spawn `atn:spec-implementation-planner` in the foreground with the leaf's id. If it returns its **Blocked** report, ask, showing the blockers:
      - **Provide a resolution** (free text): resume the same planner via `SendMessage` with it as ground truth, and handle its report the same way.
      - **Skip this leaf**: record it as "blocked, skipped", apply skip propagation and go on with the next leaf.
      - **Stop the run**: record it as "blocked, skipped" and the remaining leaves as "not processed", then go to step 6 (to step 7 if nothing was implemented).
   3. Do what gitflow.md `### Apply start` says to do before a leaf is implemented, take the leaf's baseline, then spawn `atn:spec-implementer` with the leaf's id and title.
   4. If its report holds a `TEST FAILURE` block, record the failure (leaf, failing tests, command, a summary of the last output). The leaf stays `processing`, stays off the implemented-leaves list and out of review, and its files are never staged. Ask:
      - **Retry**: spawn `atn:spec-implementer` again with the failure as context and handle its report the same way; on success drop the recorded failure and continue with step 5.5.
      - **Skip**: apply skip propagation and go on with the next leaf.
      - **Stop**: record the remaining leaves as "not processed" and go to step 6 (to step 7 if nothing was implemented).
   5. Otherwise add the leaf to the implemented-leaves list, follow gitflow.md `### Leaf done` in every repository, then code-review.md `### Leaf done` for the leaf.
   6. Before the next leaf, wait wherever code-review.md `### Leaf done` says to wait. After the last leaf, wait until every review in flight has settled.
6. Follow code-review.md `### Apply end`. Then set every implemented leaf that no code-review.md Rules subsection reviewed or completed during the run to `completed` with `specs_set_status`, and handle it as under leaf completion.
7. Once every review has settled:
   - If every leaf in `plan.order` is `completed`, the skipped set is empty and every descendant in the status map is `completed`, set the root `completed` with `specs_set_status`.
   - Otherwise leave the root `processing` and record why.
   Then follow gitflow.md `### Apply end` in every repository, also after an early stop in step 5 (never after a stop in step 2 or 3).
8. Last of all, once everything else, the git steps included, is done, turn the run's out-of-scope items into ToDo cards. Do this in every run that reached step 5, whatever its outcome (never after a stop in step 2 or 3, which collected no item):
   1. If the list is empty, ask nothing and go to the report.
   2. Call `todos_list` without `status`, which returns the project's cards that are not closed, and drop every item an existing card already covers, recording it as a duplicate of that card (with the card's title).
   3. Give each remaining item a type (`follow-up`, `tech-debt`, `bug` or `idea`) and a priority (`low`, `medium` or `high`): the subagent's proposal when it made one, otherwise your own judgment.
   4. If no item remains, ask nothing. Otherwise ask once which of the remaining items to turn into ToDo cards, as a multiple-choice question over every item (title, description, type and priority per option); when they don't fit one message, continue in further messages until every item has been offered. Without a user, ask nothing, create nothing and record every remaining item as not created.
   5. For each chosen item, call `todos_create` with `title` (at most 200 characters), `description`, `type`, `priority` and `originSpecificationId` = the specification id recorded with the item. Decide yourself, without asking for approval, whether the card needs open questions, and pass them as `questions` (at most 3) only under this rule: a question is allowed only when the card cannot be carried out without a decision that only the user can make (a product choice, mutually exclusive approaches with a real trade-off, or an irreversible or destructive action); never ask what the code, the conventions or the settings answer, and never ask "just in case"; most cards have none. Give a question its answer options, in the project's question format (recommended option first and marked), when they can be enumerated. Record the items not chosen as declined.
   6. If `todos_list` is unavailable or its call is refused, skip the question and record every item as not created with the reason. If `todos_create` is unavailable or a call is refused (the subscription plan's card limit, a missing permission or any other error), record that item as not created with the reason and carry on. A failure in this step never changes the root's status, a leaf's status or the run's outcome.

Throughout the run:

- **Leaf completion.** Whenever a leaf becomes `completed` (by the reviewer, a code-review.md Rules subsection or an accepted escalation), follow gitflow.md `### Review approved` for it in every repository it touched, then complete its intermediate nodes. Handle leaves in plan order: never for a leaf while an earlier leaf's review has not settled. If a leaf is set back to `processing`, follow `### Review approved` for it again once it is `completed` again.
- **Intermediate nodes.** Right after a leaf becomes `completed`, walk its ancestors bottom-up, stopping below the root: set each one that isn't `completed` and whose descendants in `tree` are all `completed` (a draft leaf keeps its parent open) to `completed` with `specs_set_status`, and record it. If a leaf is set back to `processing`, set every ancestor this run completed back to `processing`, and recompute once the leaf's review has settled again.
- **Skip propagation.** When a leaf is skipped (at an escalation, at a settings ask, or because it isn't `completed` once its review has settled), add to the skipped set every later leaf in the run list that has it among its `internalBlockers`, directly or transitively, with the reason "<leaf> is blocked by skipped leaf <title> (<id>, <status>)".
- **Dependency order.** Blocked-by links only order the run list: a dependent leaf may be implemented before its blocker is reviewed or `completed`, unless a code-review.md Rules subsection says otherwise.
- **Out-of-scope items.** Whenever a planner, implementer or reviewer report holds a block headed exactly `OUT OF SCOPE`, add its entries to the run's out-of-scope list, each with the id of the leaf being worked on (the root's id for a review covering several leaves or an item tied to no single leaf); a report without the block adds nothing. Keep an item that a resumed or respawned subagent returns again only once. An item qualifies only if it lies outside the scope of the specifications being applied and cannot be done within this run: drop one that is in fact a failure of a leaf of this run (a blocked or skipped leaf, a `TEST FAILURE`, an open review finding), since that leaf stays `processing` and is reported as such.

## Report

- Every leaf processed, in plan order, with the files it touched, and whether the root was set `completed` or left `processing` (and why).
- Each leaf's outcome: completed after review, completed without review, or accepted with open findings (with the findings). Call out every unfinished leaf clearly: blocked, skipped; test failures (failing tests, command, last output); skipped with open findings (with the findings); not processed. Never imply the whole subtree succeeded when there are exceptions.
- Every missing settings file or Rules subsection, and every ask with the answer chosen.
- **Dependencies**, each phrased "X is blocked by Y (id, status)": the cycle the run stopped on, unprepared internal blockers with the leaves they prevented, external blockers (title, status, tree path) with the leaves skipped and the user's choice, leaves skipped transitively and why, and the intermediate specifications completed (or reopened) during the run.
- **Git**, per repository: every git action and result the gitflow.md Rules subsections asked to record (branches, commits, tags, pushes, pull requests), skipped or aborted git operations with their reasons, and uncommitted changes left behind.
- **ToDo cards**: every card created (title, type, priority and origin specification), and every out-of-scope item skipped as a duplicate (with the existing card's title), declined, or not created (with the reason); omitted when the run collected no item.
