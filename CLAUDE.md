# Connection Reference Governance - instructions for Claude

The rules of this tool are in `.specify/memory/constitution.md`; it inherits the root constitution of the
parent folder (`../../.specify/memory/constitution.md`). Read both before changing anything.

## Independence (always)

This tool never mentions, links or compares itself with any other tool of the author (no tool names, no
"see also", no examples taken from another tool) in code, README, docs, specs, tests or commit messages.

## Shared marketplace rules (always)

`../../PPTB-PUBLISHING-RULES.md` holds the rules that keep a marketplace review from asking for changes. Read it
before touching `package.json`, the README, the icon, a release or a review answer. When something new is
learned, add it there and add the test that prevents it here. That file never names another tool.

## Skills

The `custom-*` skills in `.claude/skills/` and `docs/marketplace-page-standard.md` come from the root template. Do not
edit them here: change the template in the parent folder. A session-start hook (`.claude/settings.json`) reports files
out of date; apply with `../../scripts/sync-template.ps1 -Tool <this folder name> -Apply` only after reviewing the differences.

## Architecture

Follow `../../docs/architecture.md`: `types.ts` -> `services/` (pure) -> `host.ts` (only door to PPTB) -> `app.ts` (thin view).
Writes are split into `plan` and `apply`.

## Working rules

- Never run `npm publish` or `git push`: the user does. Push goes to GitHub (`origin`).
- Test first for defects; keep tests that were run and passed; do not repeat full/mutation runs on unchanged code.
- UI: no emoji, no redundant data, re-read lists on entry, theme variables only.
- When the user reports a requirement or UX issue during testing, update the feature's `spec.md` as well as the code.
