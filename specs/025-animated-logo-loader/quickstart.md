# Quickstart: Animated logo loader (checks 53 to 57)

Run after `npm run build`, with the tool open in Power Platform ToolBox.

- [x] **53. The wait looks alive.** Open the tool, then open a solution with many flows (or press Refresh on the Connections area). While the pane is empty the logo is large and centred, the two dashed lines run towards the right node, the three nodes pulse in turn, a soft halo breathes, and a caption says what is being read. No blank page.
- [x] **54. Both themes.** Switch the host theme to light and to dark while the loader shows: the logo stays readable and follows the colours at once.
- [x] **55. Reduced motion.** Turn on "reduce motion" in the operating system: the loader keeps moving, visibly slower; it is not frozen.
- [x] **56. No flash and no lie.** With a fast read the logo never appears for a blink. Make a read fail (disconnect the environment): the logo is replaced by the error and the way to try again, it does not keep moving.
- [x] **57. Small waits are unchanged.** The spinner in buttons, in the dialogs and in the thin line over a list that already has rows is still the small spinner; the big logo is only for an empty pane. Narrow the pane: the logo shrinks and nothing scrolls sideways.
- [x] **58. Tabs that wait say so.** While the solutions list shows Updating..., the Solutions and Connections tabs are dimmed with a progress cursor and a title that says the tool is still reading; when the read ends they are normal and a click works.
- [x] **59. Tabs inside a solution.** Open a solution: the Solutions and Connections tabs are above it. Click Connections: the list opens. Click Solutions: you are back in the same solution. Start a change (Choose changes, then Review changes): the tabs are gone until you leave the path.
