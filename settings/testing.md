---
summary: "Testing settings: test depth, e2e policy and how many attempts agents make to fix failing tests before escalating."
---

# Testing settings

## Parameters

- test_depth: unit_new_code
- e2e: skip
- test_fix_attempts: 5

## Rules

### Planning

- Plan unit tests for the new code.
- Plan no e2e tests.
- Name the test commands to run, as found in the project.

### Implementation

- Write unit tests for the new code, then run the tests covering the changed code.
- Do not create, modify or run e2e tests.
- Work out the test commands from the project itself (`package.json` scripts, README, CLAUDE.md, the Maven/Gradle wrapper and similar).
- If tests fail, fix the cause and re-run, at most 5 attempts in total per sub-project. If they still fail after the last attempt, stop working on this leaf and report a `TEST FAILURE` block.

## Custom

_Project-specific additions. Agents follow this section; the `atn-settings` skill never overwrites it._
