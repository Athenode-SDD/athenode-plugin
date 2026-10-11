---
name: todo-enqueue
description: >-
  Use when one card should be added to the project's ToDo from the current
  session, with its text, type, priority and the user's open questions.
allowed-tools: AskUserQuestion
argument-hint: >-
  [<text>] [--type <type>] [--priority <priority>] [--origin <spec_id>]
  [--no-questions]
---
Add one card to the project's ToDo without leaving the session: collect the card's text, type, priority and open questions, asking the user only for what the invocation did not supply, and record the card. One run creates one card.

## Arguments

- `<text>` (optional, free text): what the card is about.
- `--type <type>` (optional): the card's type, one of `bug`, `tech-debt`, `follow-up`, `idea`.
- `--priority <priority>` (optional): the card's priority, one of `high`, `medium`, `low`.
- `--origin <spec_id>` (optional): the specification the card originates from, stored as the card's `originSpecificationId`. The skill never asks for it when it is not passed.
- `--no-questions` (optional, in any position): a flag without a value. The card has no open questions, and the step that asks about them is skipped.

If a `--type` or `--priority` value is not one of those listed, say so with the valid values and stop, creating nothing. With a text, `--type`, `--priority` and `--no-questions` all given, the card is created without a single question to the user, unless a similar card exists.

## Flow

Ask every question in the project's question format, recommended option first.

1. **Text.** Take the text from the invocation. Without it, derive the task from the current conversation. Ask what should be recorded, as one open question without options, only when the conversation holds nothing to derive it from.
2. **Missing parameters.** Ask for the values that were not passed, in one message, in the project's question format; when none is missing, ask nothing:
   - type: all four values, the one you derive from the card's text first and marked `(Recommended)`;
   - priority: all three values, the derived one first and marked `(Recommended)`;
   - open questions, unless `--no-questions` was passed: whether the card has questions that should be recorded on it, to be discussed later when the card is carried out. The user dictates them, and the skill proposes none of its own.
3. **Open questions.** The questions of this card are the user's own, dictated in answer to the prompt of step 2: store every one the user named, translated to English, and add none of your own. The rule on when an agent may give a card an open question covers questions an agent adds by itself, so it never keeps a dictated question off the card. Write answer options, in the question format, only when the user named them; otherwise the question is stored without options. A card takes at most 3 questions here: when the user names more, say so, ask them to pick or merge the questions down to 3, mention that more can be added in the web app, and create nothing until 3 or fewer remain.
4. **Wording.** Translate the text to English and tidy it into a `title` (at most 200 characters) and a `description`, without inventing content. The result is recorded without a confirmation step and shown in the report.
5. **Duplicates.** Before creating, call `todos_list` without `status`, which returns the project's cards that are not closed. When an existing card is similar to the new one, show it (id, title and status) and ask, with two options: **Create the card anyway** or **Cancel**. On cancel, nothing is created: give the report.
6. **Create.** Call `todos_create` once with `title`, `description`, `type`, `priority`, `questions` (when the card has any) and `originSpecificationId` (when `--origin` was passed). The card is recorded as created by an agent, with the status `open`. It cannot be changed from the session afterwards: a mistake in it is fixed in the web app.

### Failures

- `todos_list` or `todos_create` is not available in the session: say that the installed Athenode tools are too old for this skill, ask the user to run `npx @athenode/cli init` in the project and restart the session, and stop.
- The `todos_list` call is refused or fails: report the reason and stop, creating nothing.
- The `todos_create` call is refused or fails (the subscription plan's card limit, an invalid `--origin`, a missing permission or any other error): report the reason and stop. Do not retry: no card was created.

## Report

- The created card's id, title, description, type and priority, and its open questions as stored.
- Or why no card was created: an invalid argument, more than 3 open questions left, cancelled as a duplicate (with the similar card's id and title), or the failure with its reason.
