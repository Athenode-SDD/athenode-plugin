---
name: todo-dequeue
description: Use when the project's open ToDo cards should be worked through one by one, each turned into a specification or carried out directly, reviewed, committed and delivered.
argument-hint: "[card_id...] [--type <type>] [--priority <priority>] [--auto]"
allowed-tools: Agent, SendMessage, AskUserQuestion, Skill, Bash
---
Work through the project's open ToDo cards one by one: for each card the user chooses between a specification (the mind map), direct execution without a specification, skipping, dismissing and stopping; a card carried out directly is implemented, reviewed, committed, closed and delivered. With `--auto` the questions are asked once at the start of the run, and every card that needs no answer from the user is then carried out directly.

## Arguments

- Card ids (optional, any number): only these cards are processed.
- `--type <type>` (optional; several values separated by commas): only cards of these types (`bug`, `tech-debt`, `follow-up`, `idea`).
- `--priority <priority>` (optional; several values separated by commas): only cards of these priorities (`high`, `medium`, `low`).
- `--auto` (optional, in any position): a flag without a value. The run asks its two git questions once at the start and then handles every card without a further question (see "Auto mode").
- Without arguments: every open card.

Card ids and filters combine: a card is taken only when it matches all of them. `--auto` combines freely with card ids, `--type` and `--priority`: those still define the queue, and `--auto` only changes how the queue is processed. If a type or priority value is not one of those listed, say so with the valid values and stop before reading any card.

## Repositories

- **The run's git repositories** are the project root plus every repository path in the `## Sub-projects` table of `settings/SETTINGS.md`, kept only where `git -C <path> rev-parse --show-toplevel` succeeds and deduplicated by that toplevel.
- Each repository follows the `gitflow.md` of the sub-project whose repository path is the longest `path/` prefix of (or equal to) its path, else the root `settings/gitflow.md`. This skill reads only its `## Parameters` (`base_branch`, `branch_name_template`, `commit_message_template`) and its `## Custom` section; the subsections written for apply runs (`### Apply start`, `### Leaf done`, `### Review approved`, `### Apply end`) do not drive this skill. A missing file or parameter falls back to `main`, `feature/<slug>` and `<type>(<scope>): <summary> [spec <spec_id>]`.
- **A repository's main branch** is the `base_branch` of its own gitflow.md.
- **A card's files** are derived from git. The card's baseline is the output of `git -C <repo> status --porcelain` in every repository, taken right before the card is executed. The card's files are the paths that `git -C <repo> status --porcelain` reports as changed or new compared with that baseline, made relative to the project root, plus the files outside every repository that `atn:todo-implementer` reports. Recompute the set after every `atn:todo-implementer` return, keeping the paths found earlier; a path already dirty at the baseline is not the card's. Files outside every repository are never staged.
- A card **touched a repository** when one of its files lies in it.

## Flow

This skill is the only actor that runs state-changing git commands; the subagents never do. It reads only settings that exist: `review_mode` and `auto_fix_attempts` from the `## Parameters` of the root `settings/code-review.md`, the gitflow.md parameters named above, and, through the subagents, the `### Implementation`, `### Review` and `### Findings` subsections. Ask every question in the project's question format, recommended option first. Questions are asked in the interactive mode (a run without `--auto`) and, with `--auto`, only at the start of the run (see "Auto mode"). Each of those questions needs the user: without a user to ask, change nothing and stop with a report saying so. Tell every subagent that no user is available, that it never runs git and that it never creates a ToDo card, and pass the user's answers as ground truth.

1. Check the arguments, work out the run's git repositories, and load the root `settings/code-review.md` and each repository's `gitflow.md`.
2. Build the queue (see "Queue").
3. Take the cards in queue order and run "Per card" for each one. With `--auto`, run "Auto mode" instead: its start once, then its handling of each card.
4. When the queue is used up, read it again (see "Queue") and continue with the cards that are new. The run ends when a re-read brings no new card, or when the user chooses to stop.
5. Give the report (see "## Report").

### Queue

1. Call `todos_list` with `status` `open`: only `open` cards are ever taken. If `todos_list` is not available in the session, say that the installed Athenode tools are too old for this skill, ask the user to run `npx @athenode/cli init` in the project and restart the session, and stop.
2. Keep the cards that match the arguments. A card id given as an argument that is not in the list is never processed: read it with `todos_get` and record it for the report as closed (with its status) or as not found.
3. Sort the cards yourself, since the list comes in another order: by priority from `high` through `medium` to `low`; within a priority by type, in the order `bug`, `tech-debt`, `follow-up`, `idea`; within a type by `createdAt`, the oldest card first.
4. Keep the set of cards offered in this run, whatever happened to them: prepared as a specification, carried out, skipped, dismissed, failed and left open, or reached when the run stopped. A card in that set is never offered again in this run.
5. A re-read repeats steps 1 to 3 and drops every card of that set. What remains are cards that appeared during the run, such as cards created by an `atn:apply` run inside the specification path.

### Per card

This subsection is the interactive mode. With `--auto` no card is shown or asked about: each one is handled as "Auto mode" says.

1. Read the card again with `todos_get` (`id` = the card id), since it may have changed since it was listed. If it is no longer `open`, record that and go on with the next card.
2. Show the card: its title, description, type and priority, and every open question with its answer, or marked as unanswered. If the card has a `resultingSpecificationId`, read that specification with `specs_get` and add a note naming it (title, id and status).
3. Ask what to do with the card:
   - For a card without a linked specification, five options: **Create a specification** (the mind map runs from the card), **Carry out directly** (no separate specification), **Skip** (the card stays open), **Dismiss** (the card is closed without being carried out), **Stop** (end the run and give the report). Recommend direct execution for a small, well-defined change and a specification for work that needs design decisions or spans several areas.
   - For a card with a linked specification, four options: **Continue the mind map on that specification**, **Skip**, **Dismiss**, **Stop**. Creating another specification and direct execution are not offered for such a card.
4. Carry the answer out:
   - **Create a specification** or **Continue the mind map on that specification**: run "Specification path".
   - **Carry out directly**: run "Direct path".
   - **Skip**: change nothing; the card stays open.
   - **Dismiss**: call `todos_set_status` with `id` = the card id and `status` `dismissed`. If the call is refused or fails, record the reason and go on.
   - **Stop**: leave the card as it is, record it as not processed, end the run and give the report.

### Specification path

1. Invoke `atn:mindmap` with `--from-todo <card_id>` and nothing else. The mind map asks the card's unanswered questions first, creates the specification linked to the card or continues the linked one, closes the card itself once the specification is prepared, then asks its usual next-action question (apply, decompose or nothing) and carries the answer out.
2. Never close the card here: after the mind map returns, make no `todos_set_status` call for it.
3. Record the specification's id and what the mind map reported, including the outcome of its next action, then go on with the next card.

### Direct path

1. **Open questions.** Right after the user chose direct execution, ask every question of the card that has no answer, with the options written in its text, and record each answer on the card with `todos_qa_answer` (`id` = the card id, `questionId`, `answer`) as soon as it is given. Never ask a question that already has an answer. If a `todos_qa_answer` call is refused or fails, keep the answer for the executor and note the reason for the report.
2. **Where to work.** Ask where the card is carried out: **A new branch for the card**, **The current branch** or **The main branch**. Ask this at the first card of the run that is carried out directly, together with a second question: **Apply this answer to all remaining cards of this run** or **Ask again for each card**. Once the answer applies to all remaining cards, do not ask again in this run. With `--auto`, ask neither question here: the answer given at the start of the run applies to every card. Then, in every one of the run's repositories:
   - **A new branch for the card**: record the current branch as the original branch, then create the card branch from the repository's main branch with `git -C <repo> switch -c <name> <main branch>`. `<name>` is the root gitflow.md's `branch_name_template` with `<slug>` taken from the card's title (lowercase, every run of characters outside `[a-z0-9]` replaced by `-`, trimmed, at most 50 characters), and it is the same name in every repository; if the name is taken, add the first free suffix (`-2`, `-3`, …) and use that name everywhere.
   - **The current branch**: run no git command.
   - **The main branch**: record the current branch, then run `git -C <repo> switch <main branch>` where the repository is on another branch.
   If git refuses to create or switch a branch (uncommitted changes in the way, a missing main branch), run no further git command there, say why and ask: **Work on the current branch in that repository**, **Skip this card** or **Stop**. With `--auto`, do not ask: the card is skipped (see "Auto mode").
3. **Execution.** Take the card's baseline, then spawn `atn:todo-implementer` in the foreground with the card: its id, title, description, type and priority, and every question with its answer. There is no planning step and no recorded plan. If its report holds a `BLOCKED` or a `TEST FAILURE` block, run "Failures".
4. **Review.** If `review_mode` is `none`, or the root `settings/code-review.md` is missing, skip the review. Otherwise spawn `atn:todo-reviewer` in the foreground with the card, its questions and answers, and the card's files. It reviews as `settings/code-review.md` says (its enabled check groups in `### Review` and its `## Custom` rules), checking conformance against the card and its answers instead of a specification.
   - `APPROVED`: the review has passed.
   - A finding marked `needs-decision`: show the reviewer's proposed change and ask **Apply the proposed change** or **Drop this finding** (the user may type another resolution); the answer goes to the executor as ground truth, and a dropped finding is closed. With `--auto`, do not ask: the card has failed (see "Auto mode").
   - Other findings: run a fix round. Resume the same `atn:todo-implementer` via `SendMessage` with the findings (or spawn a new one with the card and the findings), recompute the card's files, then resume the same `atn:todo-reviewer` (or spawn a new one) to review again from scratch. A `TEST FAILURE` block stays an open finding. Run at most `auto_fix_attempts` rounds (3 when the parameter is missing) and stop as soon as the review has passed.
   - Findings still open after the last round: run "Failures".
5. **Commit and close.** Once the review has passed or was skipped, commit in every repository the card touched:
   1. Stage exactly the card's files in that repository with `git -C <repo> add -- <path>...` (a deleted path stages its deletion). Never `git add -A` or `git add .`.
   2. If nothing is staged (`git -C <repo> diff --cached --quiet` succeeds), make no commit there. Otherwise run `git -C <repo> commit -m "<subject>"`.
   3. Build the subject from the repository's `commit_message_template`, with `[todo <card_id>]` in place of `[spec <spec_id>]` (append ` [todo <card_id>]` when the template has no such marker): `<type>` is `fix` for a `bug` card, `refactor`, `docs`, `test` or `chore` when clearly applicable, and `feat` otherwise; `<scope>` is the sub-project's settings folder name or the repository's directory name, and may be empty (then drop the parentheses); `<summary>` is the card's title, starting lowercase, without a trailing period; `<card_id>` is the card id.
   4. Record each commit's sha and subject. If a commit fails, run "Failures".
   Then remove a card branch created in step 2 from every repository the card did not touch (switch back to the original branch and delete the card branch with `git -C <repo> branch -D <name>`), and set the card to `done`: `todos_set_status` with `id` = the card id and `status` `done`. A refused or failed close is recorded for the report and never undoes a commit.
6. **Delivery.** Ask, for every card and never reusing an earlier card's answer, what to do with the commits, with four options: **Push**, **Push and open a merge request**, **Merge straight into the main branch**, **Leave the commits local**. With `--auto`, do not ask: the delivery chosen at the start of the run applies to every card. Carry the answer out in every repository the card touched:
   - **Push**: `git -C <repo> push -u origin <current branch>`.
   - **Push and open a merge request**: push, then open one merge request (pull request) per repository from the current branch to the repository's main branch, titled with the card's title, the body naming the card's id and title: with `glab` when `git -C <repo> remote get-url origin` contains `gitlab`, otherwise with `gh`, unless the `## Custom` section of the repository's gitflow.md names another way. If no tool is available or authenticated, keep the pushed branch and record why.
   - **Merge straight into the main branch**: see "Merging straight into the main branch".
   - **Leave the commits local**: run no git command.
   When the commits are already on the main branch, there is nothing to merge and no merge request to open: both of those answers then only push the main branch. A delivery failure is recorded with its reason and never reopens the card, which stays `done`.
7. Go on with the next card.

### Merging straight into the main branch

In every repository the card touched, with `<branch>` the branch the card was committed on:

1. Switch to the main branch with `git -C <repo> switch <main branch>`, record its commit, and run `git -C <repo> fetch origin <main branch>`. If the local main branch is behind `origin/<main branch>`, fast-forward it with `git -C <repo> merge --ff-only origin/<main branch>`.
2. Merge locally with `git -C <repo> merge --no-edit <branch>`.
3. Push with `git -C <repo> push origin <main branch>`.
4. On success, delete the card branch with `git -C <repo> branch -d <branch>`. A branch that was not created for the card (the user chose the current branch) is merged the same way but never deleted.
5. Nothing is merged when the main branch has diverged from `origin/<main branch>` (the fast-forward fails), the merge conflicts, or the push is rejected (for example by a protected branch): abort a merge in progress with `git -C <repo> merge --abort`, set the local main branch back to the recorded commit with `git -C <repo> reset --keep <recorded commit>`, and switch back to `<branch>`, which is kept. Report the reason and ask, for that repository: **Push the branch**, **Push and open a merge request** or **Leave the commits local**. With `--auto`, do not ask: fall back as "Auto mode" says.

### Several repositories

One answer covers every repository the card touched, for the branch and for the delivery alike. A new branch gets the same name in each of them, each repository uses its own main branch from its own gitflow.md, and the commit and the delivery are carried out in each of them. A failure in one repository is recorded for it and never stops the others.

### Failures

Direct execution has failed when the executor returned a `BLOCKED` block (it could not do the work), tests still fail (a `TEST FAILURE` block), the review has not passed after the last fix round, or a commit failed. This subsection is the interactive mode; with `--auto` a failed card is handled as "Auto mode" says, with no question. The card stays `open` and the changes are left untouched in the working tree. Show the reason and ask, with four options:

- **Retry with guidance** (free text): resume the same `atn:todo-implementer` via `SendMessage` with the guidance as ground truth (or spawn a new one with the card, the guidance and a summary of what failed), then continue from the review step and handle its result the same way.
- **Leave everything as it is and go to the next card**: the changes stay in the working tree, uncommitted, and any card branch stays.
- **Roll the card's changes back and go to the next card**: undo exactly the card's files in every repository it touched and nothing else: restore the modified and deleted paths with `git -C <repo> restore --staged --worktree -- <path>...` and delete the files the card created; never touch a path that was already dirty at the baseline. Then remove a card branch created for this card (switch back to the original branch and delete it with `git -C <repo> branch -D <name>`). Files outside every repository cannot be rolled back with git: list them.
- **Stop**: leave everything as it is, end the run and give the report.

Record the card as failed, with the reason and the answer chosen. It is not offered again in this run.

### Auto mode

With `--auto` the run asks its questions once, at the start, and then handles every card of the queue without a question. Whatever this subsection does not change works as the subsections above say.

**Start of the run.** Once, after the queue is built and before any card is handled:

1. Show a short summary, which asks nothing: how many cards will be carried out; which cards will be skipped and why (unanswered open questions, a linked specification); and which of the run's repositories have uncommitted changes (`git -C <repo> status --porcelain` reports paths), so that the user can abort before answering. If the queue is empty, ask nothing and give the report.
2. Ask two questions, together and only once. The answers apply to every card of the run:
   - **Where to work**, three options: **A new branch per card**, **The current branch** or **The main branch**. There is no follow-up question about the remaining cards.
   - **Delivery**, four options: **Push**, **Push and open a merge request**, **Merge straight into the main branch**, **Leave the commits local**. The delivery comes from this answer and from no setting.
3. From here on the run asks nothing. Without a user to answer the two questions, change nothing and stop with a report saying so.

**Each card.** Read the card again with `todos_get`, as step 1 of "Per card" says, then handle it without a question, at most once per run:

| Card | Outcome |
|---|---|
| Has at least one unanswered open question | Skipped; the card stays open. The question is not asked and no answer is stored. |
| Has a linked specification (`resultingSpecificationId`) | Skipped; the card stays open. No mind map is run. |
| Any other card | Carried out with steps 2 to 6 of "Direct path", however large it is, with the two answers given at the start. |

A card is never dismissed, and no card stops the run: the executor returning `BLOCKED` and the review are the only brake.

**Outcomes where the interactive mode would ask.**

| Situation | Outcome |
|---|---|
| Git refuses to create or switch the branch for a card | Skip the card: put every repository back on the branch it was on, delete a card branch already created for this card, record the reason and go on with the next card. |
| The review returns a finding marked `needs-decision` | The card has failed; the finding is part of the reason. |
| The card has failed: the executor returned a `BLOCKED` block, tests still fail, the review has not passed after the last fix round, or a commit failed | Roll back this card's changes only (see "Rollback" below), leave the card `open`, record the reason and go on with the next card. |
| **Merge straight into the main branch** was chosen and the merge or its push fails | Undo the merge as step 5 of "Merging straight into the main branch" says, then push the card's branch and open a merge request into the main branch. If that fails too, the commits stay local. The card stays `done` either way, and the report says how the delivery ended. |

**Rollback.** Undo exactly the card's files in every repository it touched, the way the roll-back option of "Failures" does, and nothing else: never touch a path that was already dirty at the baseline, so the uncommitted changes that were in the working tree before the card started stay as they were. Then put every repository back on the branch the card started from and delete a card branch created for this card, unless it holds a commit of the card, which is kept and reported. The next card starts from the state this card started from. Files outside every repository cannot be rolled back with git: list them.

**Queue.** The queue is read again as "Queue" says, so cards that appear during the run are picked up. Cards carried out, skipped and failed all count as handled and are never taken again, so the run always ends: it ends when a re-read brings no new card.

## Report

- Every card handled in the run, in the order it was offered, with its id, title and outcome: specification prepared, carried out, skipped, dismissed, failed (with the reason and the answer chosen), or not processed because the run stopped.
- For the specification path: the specification's id and the outcome the mind map reported, its next action included.
- For the direct path: the questions answered, the review result (passed, with the number of fix rounds, or skipped), and per repository the branch, the commits (sha and subject) and the delivery result: pushed, the merge request's URL, merged into the main branch, left local, or the failure with its reason.
- Card ids given as arguments that were not processed, each as closed (with its status) or not found.
- Every out-of-scope item a subagent returned, as a list the user may turn into cards; this skill creates no card.
- With `--auto`: the two answers given at the start, and every handled card as carried out (its commits and how they were delivered, including a merge that fell back to a merge request or to local commits), skipped (the reason: unanswered open questions, a linked specification, or git refused the branch) or failed and rolled back (the reason, including any `needs-decision` finding).
- Every missing settings file or parameter, every ask with the answer chosen, and uncommitted changes left behind.
