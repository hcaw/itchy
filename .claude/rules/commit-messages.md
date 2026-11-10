# Commit message format

This repo follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

## Type

Required. One of:

- `feat` — new feature
- `fix` — bug fix
- `refactor` — code change that neither fixes a bug nor adds a feature
- `chore` — tooling, config, formatting, deps, housekeeping
- `docs` — documentation only
- `test` — adding or correcting tests
- `ci` — CI/CD pipeline changes
- `style` — formatting-only change with no code meaning change (rare; prefer `chore` for tooling-driven formatting)

## Scope

Optional, in parentheses immediately after the type: `type(scope): ...`. Use the area the change is
centred on: `daw` (`src/daw/`), `react` (`src/react/`), `model` (`src/model/`), `e2e` (`tests/e2e/`), or a
tool or its config, such as `lint`, `oxfmt`, `tsconfig`, `vite`, `wrangler` or `deps`. Omit the scope when a
change spans multiple areas or is repo-wide (most `chore` and `docs` commits omit it).

A `!` after the type/scope (`feat(daw)!: ...`) marks a breaking change; pair it with a
`BREAKING CHANGE:` footer describing the break.

## Description

- Imperative mood ("add", "fix", "rename" — not "added", "fixes", "renamed")
- Lowercase first letter, no trailing period
- Concise summary of the _why_/_what_, not a restatement of the diff

## Body

Optional. Only add one when the description alone doesn't explain the motivation — most commits in
this repo don't have one. When present, explain why the change was made, not what changed line by
line.

## Footers

Use trailers for issue linking only, one per line:

- `Closes #123` / `Fixes #123` — closes an issue on merge
- `Refs #123` — related to an issue without closing it

## Examples

```
fix(react): colour notes on the key's row so they no longer stay grey

Closes #123
```

```
refactor(daw): move the grid's region and notes out of the critter
```

```
chore: format the codebase with Oxfmt
```
