---
name: decompose
description: >-
  Use when an existing specification should be broken into one level of stage
  specifications that are clarified, finalized and prepared.
allowed-tools: 'Agent, AskUserQuestion, Skill, Bash, WebSearch, WebFetch'
argument-hint: '<spec_id> [--auto-apply]'
---
Break an existing specification into one level of draft child stages, collect the answers to each stage's open questions, then have every child finalized, prepared and linked to its blockers.

## Arguments

- `$1`: the id of the specification to decompose.
- `--auto-apply` (optional, in any position): once every child is finalized, apply the parent instead of asking what to do next. It suppresses no other question.

## Flow

1. If `$1` is missing, call `specs_list` with `topLevel` `true` and ask which specification to decompose (title and id per option; the user may type an id instead).
2. Read the parent with `specs_get`. Load `methodology.md` `### Spec authoring` and follow it whenever you write specification content.
3. Take the stage breakdown (titles and scope):
   - If the invocation or the conversation already describes the stages (for example a `atn:spec-decomposer` breakdown under `## Proposed child specifications`), use it.
   - Otherwise ask the user, as an open question, to describe the stages. Spawn no subagent for this step.
4. For each stage, write a `title`, `summary` and Markdown `content` from its description and the parent:
   - If web research would materially inform the stage (an external API, library, standard or documentation its scope depends on), research it with `WebSearch` / `WebFetch` first, and end the content with a `## References` section listing only the sources that informed a decision: one bullet per source, the URL or local path verbatim, with a short label of what it informed (user-given labels are kept). Never paraphrase, drop or invent a reference.
   - Create it with `specs_create` (`title`, `parentId` = the parent id, `summary`, `status` `draft`, `content`). Never pass `blockedBy`.
5. For each created child, attach its clarifying questions with `specs_qa_add` (`specificationId` = the child id), one call per question, each with 2–5 distinct options in the question text. Err toward more questions: surface every open decision that would materially change the stage's scope, interface or approach, and skip only what the parent, the tree's conventions or common sense already answer.
6. For each created child, in order:
   1. Read its questions with `specs_qa_list`.
   2. Ask every question whose `answer` is still null, with options grounded in the stage (the stored options are a good start).
   3. Record each answer with `specs_qa_answer` (`specificationId`, `questionId`, `answer`).
7. Spawn `atn:spec-decomposition-finalizer` in the foreground with the parent id and every created child (id — title for each). It rewrites, prepares and links every child, including the ordering between the stages; this skill never creates blocked-by links itself.
8. Give the report (see "## Report") before anything else runs.
9. Next action:
   - If `--auto-apply` was given, invoke `atn:apply` with the parent id and report its outcome.
   - Otherwise ask what to do next:
     - **Apply now** (`atn:apply` runs unattended, except that it asks about external blockers and, at the end of the run, which out-of-scope items to turn into ToDo cards): invoke `atn:apply` with the parent id and report its outcome.
     - **Decompose a stage further**: ask a multiple-choice question over every created child (title and id per option), even when there is only one. Invoke `atn:decompose` with each selected child id, one after another (each run is interactive), then give one aggregated report.
     - **Nothing else**: stop.

## Report

- The parent's id and title and every finalized child's id and title, taken from `specs_list` (`parentId` = the parent id, `status` `prepared`) rather than from the finalizer's summary alone.
- Each child's blockers from `specs_blockers_list`, as "<child title> is blocked by <blocker title> (<blocker id>, <status>)", then the links the finalizer added, removed and skipped per child, each skipped or rejected link with its reason.
- After **Decompose a stage further**: one aggregated report of the nested runs, each child's id with every grandchild id and title it finalized.
