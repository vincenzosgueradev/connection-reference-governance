# Plan: New connection reference from the re-point dialog

## Technical context

Pure rules in `model/newReference.ts` (name, prefix, validation, record, connection choices); `services/dataverse.ts` `createReference` (check, read the component type, create, add to the solution, read back, compensate); `host.ts` gains `create` and `addToSolution` (no custom header: `AddSolutionComponent` replaces `MSCRM.SolutionUniqueName`, so `noCustomHeaders` keeps passing); the reducer holds the form (`newReference`); `views/newReference.ts` draws it in the right pane of the studio; the controller wires Review and Create.

## Constitution check

- T1/T3: nothing is written until the form was reviewed (exact record, solution, environment) and Create pressed; only one row is created.
- T4b: the name is checked against the environment just before, the row and its membership are read back; a difference is a failure and the row is deleted again.
- T5: the component type is read (members, environment, definitions), never guessed.
- Independence: no other tool is named.

## Decisions

- No live list of connections: no verified source (see spec, Open points). Offered: none, those already in use, or pasted.
- The form is not a wizard step: a single reference is a small write, and the review inside the form is its preview.

## Amendment 2026-11-07: side panel

`views/newReference.ts` now returns a layer (scrim + panel) that `views/studio.ts` appends to the dialog box; the right pane is no longer replaced. Motion is CSS (`newref-in`, `newref-out`) played only when the panel opens or closes (a module flag, as the studio steps do); closing waits the length of the animation before dispatching `closeNewReference`. Escape goes to the panel first. Constitution check: T8 (UI: no emoji, theme variables, no redundant data) and the unchanged T2c.

## Amendment 2026-11-07: header and connection cards

`model/newReference.ts` `connectionChoices` returns, per connection id, its references (owner, email, flows of the solution) and the totals; `services/dataverse.ts` reads `internalemailaddress` of the reference owners with one more plain query (a failure only leaves emails empty); `state` keeps `openConnections` in the form; `views/newReference.ts` draws the two header rows and the cards with an expander (a sibling of the radio, never nested in it). The folder glyph is defined in `styles.css` (the kit file is shared and not edited here) and takes its colour from the warning token. Constitution check: T5 (only verified data: owner of the reference rows, labelled as such), T7 (emails on screen only), T8 (no emoji, icons from the kit).

## Amendment 2026-11-07: connection check and suggestions

New pure module `model/liveConnections.ts` (parse the list, environment id, normalise a pasted name, verdict found / missing / other connector / unknown); `model/newReference.ts` gains `live` and `seed` in the form, the verdict in `checkForm`, `connectionChoices` over the listed connections, `suggestions` and `withSuggestion`. `host.ts` gains two doors, `environmentId` (RetrieveCurrentOrganization) and `listConnections` (`powerplatformAPI.Connectivity.Get`, read only, no header); `services/dataverse.ts` gains `loadLiveConnections` and checks the connection again in `createReference`. The reducer holds `live` (loading, ready, unavailable) and applies suggestions; the controller reads the list when the panel opens and on Refresh and Check, and ignores an answer that arrives after the panel closed. `package.json` declares `features.enabledForPowerPlatformAPI` (publishing rules). Constitution 1.6.0: T1 (second read-only API), T2c (connection verified), T7 (what leaves the device).

## Amendment 2026-11-07: room, scroll, feedback

`views/main.ts` keeps the scroll of `.newref-body` across redraws (the same way it keeps the other bodies), keyed by the step (`data-step`) so Details and Review each open at the top. The form gains `suggestOpen` (open at first, folded by a suggestion) and the action `toggleSuggestions`; "applied" is derived by comparing the three fields with the suggestion. Layout only otherwise: `styles.css` (wider panel, one-row header, two-column meta).

## Amendment 2026-11-07: explicit search, focus

The form gains `connectionSource` (`none` | `card` | `typed`) and `checked` (the id that was searched and its verdict). `pickConnection` (card or none) and `connectionChecked` (the result of a search) are new actions; typing sets the source to `typed` and clears nothing but the acceptance (the verdict only counts for the text that was searched). The controller's `checkConnection` reads the list again and dispatches the verdict. `checkForm` accepts a typed id only when `checked` holds its verdict. The buttons are never disabled while reading; `views/studio.ts` marks the first field for autofocus only on opening; `views/main.ts` refocuses with `preventScroll`.

## Amendment 2026-11-07: a visible wait

`createReference` takes an optional `onStep` callback (`check`, `write`, `readback`) called when each step starts; the controller dispatches `newReferenceStep` (state `step` of the form, `done` at the end), waits `celebrateMs` (700 in the tool, 0 in tests unless asked) and then dispatches `referenceCreated`. The view draws the timeline from `step`, a spinner in the button and an indeterminate bar (CSS only, `newref-slide`). The kit's `.spinner` is reused; nothing in the shared kit is edited. Constitution check: T8 (every wait is visible and honest).
