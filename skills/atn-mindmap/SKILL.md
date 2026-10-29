---
name: atn-mindmap
description: Use when shaping a new specification, or continuing an existing one, through researched question rounds until it is prepared.
claudecode:
  argument-hint: "[--continue <spec_id> | --from-todo <card_id>] [--auto-apply] [--auto-decompose]"
  allowed-tools: Agent, AskUserQuestion, Skill, Bash, WebSearch, WebFetch
codexcli:
  argument-hint: "[--continue <spec_id> | --from-todo <card_id>] [--auto-apply] [--auto-decompose]"
  allowed-tools: Agent, Skill, Bash, WebSearch, WebFetch
cursor:
  metadata:
    argument-hint: "[--continue <spec_id> | --from-todo <card_id>] [--auto-apply] [--auto-decompose]"
    allowed-tools: Agent, Skill, Bash, WebSearch, WebFetch
copilot:
  argument-hint: "[--continue <spec_id> | --from-todo <card_id>] [--auto-apply] [--auto-decompose]"
  allowed-tools:
    - agent
    - execute
    - web
copilotcli:
  argument-hint: "[--continue <spec_id> | --from-todo <card_id>] [--auto-apply] [--auto-decompose]"
  allowed-tools:
    - agent
    - execute
    - web
opencode:
  allowed-tools:
    - task
    - skill
    - bash
    - websearch
    - webfetch
devin:
  argument-hint: "[--continue <spec_id> | --from-todo <card_id>] [--auto-apply] [--auto-decompose]"
  allowed-tools:
    - exec
qwencode:
  argument-hint: "[--continue <spec_id> | --from-todo <card_id>] [--auto-apply] [--auto-decompose]"
---

Build a specification through rounds of questions in which the user steers the next topic, then synthesize it, link it to its blockers and prepare it; with `--continue`, resume on an existing specification instead; with `--from-todo`, start from a ToDo card.

## Arguments

- A subject (optional, free text): what the new specification is about.
- `--continue <spec_id>` (optional): run the continuation flow on that existing specification, reusing its recorded questions and answers, instead of creating a new one.
- `--from-todo <card_id>` (optional): start the mind map from that ToDo card. Its title and description are the subject, the new specification is linked to the card, the card's unanswered open questions are asked before the first round, and the card is closed once the specification is prepared. Free text given with it only adds context that narrows or steers the mind map; it never replaces the subject.
- `--auto-apply` (optional): skip the next-action question and apply the specification; `atn-apply` still asks at its own ask points.
- `--auto-decompose` (optional): skip the next-action question and decompose the specification; together with `--auto-apply`, the decomposed stages are applied too.

`--continue` and `--from-todo` cannot be combined: if both are given, say so and stop. The auto flags combine freely with either, in any order. The auto flags only change "Next action"; every other question is still asked.

## Flow

Load `methodology.md` `### Spec authoring` and follow it whenever you write specification content. If both `--continue` and `--from-todo` were given, say that they cannot be combined and stop, creating and changing nothing. If `--from-todo` was given, run "From a ToDo card (--from-todo)"; if `--continue` was given, run "Continuation (--continue)"; otherwise run "New specification".

### New specification

1. Take the subject from the invocation or the conversation; otherwise ask for it as an open question.
2. Spawn `spec-placement-researcher`, `spec-feasibility-analyst` and `spec-dependency-researcher` in parallel (one message, three `Agent` calls), each given the subject plus any draft title, summary or content the conversation holds.
   - Ask about the placement recommendation: "Yes, place it there" / "No, top-level instead" / "Let me specify a different parent". For a different parent, call `specs_list` with `topLevel` `true` and ask which one (title and id per option; the user may type an id instead).
   - Keep the feasibility findings for round 1 and the dependency research for the link reconciliation.
3. Create an anchor draft with `specs_create`: a short working `title` from the subject, a placeholder `summary` and `content` saying the mind map is in progress, `status` `draft`, and `parentId` only if a parent was chosen. Its id is the mind map's id; every round's questions and answers are stored against it as they happen. If the run started from a ToDo card, also pass `todoCardId` = the card's id, which links the new specification to the card (a failed call is handled as "From a ToDo card (--from-todo)" says).
4. Run the rounds (see "Rounds").
5. Read the full transcript with `specs_qa_list` and synthesize the final `title`, `summary` and Markdown `content`, organized by topic rather than as raw question and answer pairs. When a URL or local path the user mentioned, or `WebSearch` / `WebFetch` research, informed a decision, end the content with a `## References` section: one bullet per source, verbatim, keeping the user's labels and labelling web sources with what they informed. Never paraphrase, drop or invent a reference.
6. Save it with `specs_update` (`id`, `title`, `summary`, `content`); the placement was already set at creation.
7. **Reconcile blocked-by links** for the mind map's id (see "Reconciling blocked-by links"), also skipping the chosen parent and its whole ancestor chain, since the early research ran before the placement was known.
8. Call `specs_set_status` with `id` = the mind map's id and `status` `prepared`.
9. If the run started from a ToDo card, close the card (see "From a ToDo card (--from-todo)").
10. Give the report (see "## Report"), then continue with "Next action".

### Continuation (--continue)

1. Read the target with `specs_get`.
   - If the call fails, say the id is invalid and ask whether to give a corrected id or start a new specification instead (then run "New specification").
   - If it has children (`hasChildren`), warn and ask whether to continue anyway; if not confirmed, stop. This is asked under the auto flags too.
2. Keep the target's placement: no placement research, no anchor draft, no re-parenting.
3. Spawn `spec-feasibility-analyst` and `spec-dependency-researcher` in parallel with the target's title, summary and content. Also give `spec-dependency-researcher` the target's id and its current blockers (`specs_blockers_list`), and tell it the target may have descendants, so the target and its whole subtree are excluded.
4. Read the recorded questions with `specs_qa_list`:
   - If there are none, derive the subject from the target's title, summary and content, as for a first round.
   - Otherwise ask, as an open question, to confirm or clarify the subject, and infer the topics already covered from the transcript.
5. Run the rounds against the target's id (see "Rounds"), leaving its status unchanged until the end.
6. Read the full transcript again with `specs_qa_list` and synthesize `title`, `summary` and `content`:
   - If this session materially changed the specification's logic or direction, rewrite it from scratch.
   - Otherwise keep the existing content as the base and merge the new material into it.
7. Save it with `specs_update` (`id`, `title`, `summary`, `content`).
8. **Reconcile blocked-by links** for the target (see "Reconciling blocked-by links"), also skipping its descendants.
9. Call `specs_set_status` with `id` = the target's id and `status` `prepared`, whatever its previous status and however step 8 went.
10. If the run started from a ToDo card, close the card (see "From a ToDo card (--from-todo)").
11. Give the report (see "## Report"), then continue with "Next action".

### From a ToDo card (--from-todo)

Only a run started with `--from-todo` reads or changes a ToDo card, and the only changes it ever makes are recording answers to that one card's open questions and closing it: never create, reopen or otherwise move a card, and never add, edit or delete a card question.

1. Read the card with `todos_get` (`id` = the card id) before anything else.
   - If `todos_get` is not available in the session, say that the installed Athenode tools are too old for `--from-todo`, ask the user to run `athenode init` in the project and restart the session, and stop; nothing has been created.
   - If the call fails, say the card id is invalid and ask whether to give a corrected card id or start a new specification instead (then run "New specification" without a card: no `todoCardId`, no close).
2. The card's `title` and `description` are the subject. Free text given with the flag only adds context that narrows or steers the mind map; it never replaces the subject.
3. Choose the path from the card's `status` and `resultingSpecificationId`. The card is closed when its `status` is `done` or `dismissed`, and open otherwise; read a resulting specification's `status` with `specs_get`.
   - **Closed card, no resulting specification**: create nothing, tell the user to reopen the card in the ToDo tab first, and stop.
   - **Open card, no resulting specification**: run "New specification" with the card's subject, creating the anchor draft with the card's id as `specs_create` says there. If that `specs_create` call fails:
     - If it is rejected because the card already has a resulting specification (a conflict), read the card again and take the path that now applies.
     - If the error says the specification was created but its link to the card was not recorded or could not be confirmed, read the card again: if its `resultingSpecificationId` is the specification named in the error, carry on with it as the anchor draft; otherwise report that specification's id as an unlinked draft and stop.
     - For any other failure, report it and stop.
   - **Open card, resulting specification in `draft`**: run "Continuation (--continue)" on that specification; never create a second specification for the card.
   - **Closed card with a resulting specification, or a resulting specification past `draft`**: ask whether to continue, naming the card's `status`, the specification's title and its `status`, and saying that continuing prepares the specification again whatever its current status: "Continue the existing specification" / "Stop". This is asked under the auto flags too. To continue, run "Continuation (--continue)" on that specification; to stop, change nothing.
4. Before the first round of "Rounds", once the specification the run works on exists (the anchor draft, or the continued specification), deal with the card's open questions, which the card read in step 1 carries in `questions`:
   1. Ask every question whose `answer` is null, with the options written in its text. Never ask a question that already has an answer.
   2. Record each answer on the card with `todos_qa_answer` (`id` = the card id, `questionId`, `answer`) as soon as it is given. If the call is refused or fails, keep the answer for the transcript and note the reason for the report.
   3. Copy every question of the card, those answered earlier included, with its answer into the specification's transcript, so the synthesis sees them: `specs_qa_add` (`specificationId`, and the question text as `question`), then `specs_qa_answer` with the returned `questionId` and the `answer`. Skip a question the transcript already holds with the same text.
   A card without questions skips this step.
5. Close the card right after the specification is set `prepared` and before the report: call `todos_set_status` with `id` = the card id and `status` `done`. If the call is refused or fails (a card that is already `dismissed` cannot be set to `done` by an agent), note the reason for the report and carry on: a refused or failed close never stops the flow, and the specification stays `prepared`.

### Rounds

Track the topics already covered, starting with the subject. Each round:

1. Draft 3 to 8 questions on the current topic (scope, constraints, edge cases, users, integration points, non-goals and similar), as many as the topic warrants, informed by the subject, the feasibility findings so far and every earlier answer. Give each 2–5 distinct options.
2. Ask them.
3. Store each answered pair right away: `specs_qa_add` (`specificationId`, and the question with its options as `question`), then `specs_qa_answer` with the returned `questionId` and the `answer`.
4. Only if an answer ties the specification to an existing system, or a topic hinges on a technical constraint you can't judge, spawn `spec-feasibility-analyst` again; keep this rare.
5. Ask for the next topic with exactly four options: three new candidate topics that aren't covered yet, and "Finish the mind map".
   - If the user finishes, leave the rounds.
   - Otherwise add the chosen topic to the covered topics and run the next round on it.

### Reconciling blocked-by links

"X is blocked by Y" means Y must be completed before X is implemented. Never ask the user here, and never let this step stop the flow.

1. Use the `spec-dependency-researcher` result from the start of the flow. Re-run it on the final title, summary and content (with the id and current blockers) only if the specification's scope, goal or major areas changed radically since.
2. Only set this specification's own blockers; never make another specification blocked by it.
3. Read the current links with `specs_blockers_list`.
4. Remove first: call `specs_blockers_remove` (`id`, `blockerId`) for each current blocker the research lists under `### Existing blockers to remove`.
5. Then call `specs_blockers_add` (`id`, `blockerIds` with a single id) for each missing blocker under `### Proposed blockers`, one link per call.
6. Skip, without a call, blockers that are `completed`, the specification itself, its ancestors and descendants, and links that already exist.
7. If a call is rejected (a 400 or 409, a cycle included) or the researcher run failed, record the link as skipped with the reason and carry on.

### Next action

- If both `--auto-apply` and `--auto-decompose` were given: spawn `spec-decomposer` with the specification's id and accept its `## Proposed child specifications` without confirmation (even if thin or empty). Then invoke `atn-decompose` with the id and `--auto-apply`, and pass its report through as is.
- Else, if only `--auto-decompose` was given: do the same, but invoke `atn-decompose` with the id only; its own questions stay interactive.
- Else, if only `--auto-apply` was given: invoke `atn-apply` with the id and report its outcome.
- Otherwise ask what to do next:
  - **Apply now** (`atn-apply` runs unattended except at its own ask points: a settings rule that says to ask, a blocked leaf plan, a test failure, external blockers and, at the end of the run, which out-of-scope items to turn into ToDo cards): invoke `atn-apply` with the id and report its outcome.
  - **Decompose into stages**: spawn `spec-decomposer` with the id, show its `## Proposed child specifications` (titles and one-line scopes) and ask "Yes, create these as drafts" / "No, skip decomposition for now". If confirmed, invoke `atn-decompose` with the id and report the parent and every finalized child (id and title) from its report; otherwise stop.
  - **Nothing else**: stop.

## Report

- The specification's id, always stated explicitly.
- The blocked-by links added, removed and skipped, each skipped link with its reason.
- In a run started from a ToDo card: the card's id and whether it was closed, or why the close was refused or failed, plus the card questions asked and every answer that could not be stored on the card.
- The outcome of any skill invoked in "Next action".
