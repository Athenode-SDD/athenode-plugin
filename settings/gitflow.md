---
summary: "Git workflow settings: branch, commit and tag strategy for apply runs, plus branch name and commit message templates."
---

# Gitflow settings

## Parameters

- branch_strategy: per_apply
- base_branch: main
- commit_strategy: per_leaf
- tag_strategy: none
- tag_prefix: v
- after_apply: leave
- branch_name_template: feature/<slug>
- commit_message_template: <type>(<scope>): <summary> [spec <spec_id>]

## Rules

### Apply start

- Record `git -C <repo> status --porcelain` in every repository as its pre-run dirty paths.
- Create one run branch per apply run in every repository, named `feature/<slug>` with `<slug>` taken from the root specification's title, starting from `main`, following the branch creation steps below.
- Branch creation steps:
  1. Slug: lowercase the title, replace every run of characters outside `[a-z0-9]` with `-`, trim `-` at both ends, truncate to 50 characters and trim trailing `-` again.
  2. Clean tree: if `git -C <repo> status --porcelain` reports paths other than those the user already chose to carry over in this repository, ask the user, listing them: **Commit them first** (stage exactly those paths and commit them on the current branch with the message `chore: wip before <slug>`), **Stash them** (`git -C <repo> stash push --include-untracked -- <paths>`), **Carry them over onto the new branch** (leave them and don't ask about them again in this repository) or **Abort git operations for this repository**. Without a user, abort git operations for this repository.
  3. Existing name: if `git -C <repo> rev-parse --verify --quiet refs/heads/<name>` succeeds, ask the user whether to **Reuse it** (`git -C <repo> switch <name>`) or **Create `<name>-2`** (the first free suffix: `-2`, `-3`, …). Without a user, create the suffixed branch.
  4. Switch: record the current branch (`git -C <repo> branch --show-current`, or the commit from `git -C <repo> rev-parse HEAD` when detached) as the new branch's original branch, and the commit it starts from as its start point. For a branch from `main`, run `git -C <repo> switch -c <name> main`; if `main` doesn't exist locally, run `git -C <repo> fetch origin main` and use `origin/main`. For a stacked branch, run `git -C <repo> switch -c <name>`. If the base still doesn't exist, or git refuses to switch, abort git operations for this repository and report why.
  5. Record the branch for the report.

### Leaf done

- Commit the leaf in every repository it touched, following the commit steps below.
- Commit steps, used by every commit this file asks for:
  1. The staged set is the leaf's files in this repository that `git -C <repo> status --porcelain -- <paths>` reports as changed. If it is empty, make no commit in this repository.
  2. Stage exactly the staged set with `git -C <repo> add -- <path>...` (a deleted path stages its deletion). Never `git add -A` or `git add .`.
  3. If nothing is staged (`git -C <repo> diff --cached --quiet` succeeds), skip the commit. Otherwise run `git -C <repo> commit -m "<subject>"` (add `-m "<body>"` for a body).
  4. Build the subject from the template `<type>(<scope>): <summary> [spec <spec_id>]`: `<type>` is `feat` by default, `fix` for a fix, and `docs`, `test`, `refactor` or `chore` when clearly applicable, with `!` after the type and a `BREAKING CHANGE:` footer in the body only when the specification describes a breaking change; `<scope>` is the sub-project's settings folder name or the repository's directory name, and may be empty (then drop the parentheses); `<summary>` is the leaf title, starting lowercase, without a trailing period; `<spec_id>` is the leaf id.
  5. List a staged path that is among the pre-run dirty paths in the report as "may include pre-run changes". Record the commit's sha and subject for the report.

### Review approved

- If any of the leaf's files are still changed in a repository (review fixes), commit them there as a follow-up commit, following the commit steps in `### Leaf done`, with type `fix` and summary `address review findings for <leaf title>`.

### Apply end

- Remove every branch this run created that holds no changes, following these branch cleanup steps:
  1. Keep the branch unless `git -C <repo> rev-list --count <start point>..<name>` is `0` and no leaf it was created for (every leaf of the run for a run branch, the leaf itself for a leaf branch) has changed files in this repository.
  2. Switch back to its original branch (`git -C <repo> switch <original branch>`, or `git -C <repo> switch --detach <commit>` when it was detached); carried-over changes move along.
  3. Delete it with `git -C <repo> branch -D <name>`. Never delete a reused existing branch.
  4. If the switch fails, keep the branch and report it. Record every removed branch for the report.
- Create no tags.
- Do not push and do not open a pull request.

### Implementation

- Never run a git command that changes state — no `git add`, `commit`, `branch`, `checkout`, `switch`, `stash`, `reset`, `restore`, `rebase`, `merge`, `tag` or `push`. Read-only commands such as `git status` and `git diff` are fine. Git operations belong to `atn-apply` and the user.

## Custom

_Project-specific additions. Agents follow this section; the `atn-settings` skill never overwrites it._
