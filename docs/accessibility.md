# Accessibility

How the game is played without a pointer or without sight, what every control is called, and how
the themes and the reduced-motion setting behave. The organization's
[accessibility statement](https://github.com/luminare-dev/.github/blob/main/ACCESSIBILITY.md)
applies on top of this page.

## Keyboard map

Focus order on the main screen, from the start of the page (the disabled Guess button is skipped
while the guess box is empty):

1. Statistics (button)
2. About (button)
3. Play the snippet (button; Stop while it plays)
4. Your guess (combobox)
5. Skip (button)
6. Guess (button)
7. Luminare Development, project page (link, footer)
8. About (button, footer)
9. Privacy and legal (link, footer)

After a daily round ends the stops after the play button are: Listen on Apple Music (link), Share
result (button), Play a free round (button), then the footer. After a free round: Listen on Apple
Music (link), Play a free round (button), Back to today's round (button), then the footer.

Keys in the guess box:

| Key | List closed | List open |
|---|---|---|
| Typing | updates the search; from two characters the list opens when a song matches, and the number of matches is announced | the same |
| ArrowDown | opens the list and highlights the first song | moves the highlight down (no wrap) |
| ArrowUp | nothing | moves the highlight up (no wrap) |
| Home, End | move the caret | highlight the first or the last song |
| Enter | guesses an exact match of what you typed, otherwise announces "No matching song" | guesses the highlighted song; with one match and no highlight, guesses that one |
| Escape | clears the text | closes the list and keeps the text |
| Tab, Shift+Tab | move focus | close the list and move focus; nothing is selected |

Buttons react to Enter and Space. The sheets (Statistics, About) close with Escape or their Close
button; inside the About sheet the theme choice is a radio group: the arrow keys move to the next
or previous option and choose it at once (wrapping at the ends), and Space or Enter chooses the
focused option.

## Controls, roles and names

| Control | Role | Accessible name or state |
|---|---|---|
| Wordmark | heading, level 1 | `FiveGuesses` |
| Statistics, About (header) | button | `Statistics`, `About` |
| Play or stop | button | `Play the {n}-second snippet` or `Stop the snippet`; `aria-pressed` while loading or playing |
| Snippet progress | progressbar | `Snippet progress`; value 0 to the length of the snippet that plays (the unlocked seconds while nothing plays) |
| Guess box | combobox | `Your guess`; `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"` |
| Matching songs | listbox with option children | `Matching songs`; the highlighted option is `aria-selected` |
| Skip | button | `Skip · unlock {n}s`, on the last guess `Skip` described by `This is your last guess` |
| Guess | button | `Guess`; disabled while the guess box is empty |
| Board | list with five listitems | `Your guesses`; each row `Guess {n}: wrong, {song}`, `Guess {n}: right artist, wrong title, {song}`, `Guess {n}: skipped`, `Guess {n}: correct, {song}`, `Guess {n}: your next guess` or `Guess {n}: not used` |
| Result headline | heading, level 2 | `Correct!` or `Out of guesses` |
| Album artwork | img | `Album artwork for {song}` |
| Listen on Apple Music | link | `Listen on Apple Music`, described by `Opens in a new tab` |
| Share result | button | `Share result`; the outcome (`Shared`, `Copied to clipboard`, or the text to copy) is shown and announced |
| Countdown | timer | `Next song in HH:MM:SS`; not announced while it ticks |
| Statistics sheet | dialog | `Statistics`; four values each named `{label}: {value}`, a level-3 heading `Guess distribution` and a list of five rows `Won on guess {n}: {count}` |
| About sheet | dialog | `About FiveGuesses`; the lockup image is named `Luminare Development`; the theme choice is a radiogroup `Theme` with the radios `System`, `Light`, `Dark` |
| Footer | links and a button | `Luminare Development, project page`, `About`, `Privacy and legal` |

The glyphs on the board (`✕`, `»`, `≈`, `✓`) and in the buttons are hidden from assistive
technology; the row names above carry the meaning. No state is shown by colour alone: a wrong
guess, a skipped guess, a guess with the right artist and the winning guess each have their own
glyph and wording.

## Live region policy

One always-mounted polite live region (`role="status"`) sits directly under the header. Every
round event is sent through it exactly once: a wrong guess, a skipped guess, a partial guess (right
artist, wrong title), the win or the loss with the song's name, the number of matching songs while
typing, the share outcome, a started free round, the return to the daily round, the daily rollover
(`A new daily song is ready`), the reset of the stored data, and the snippet notices: the loading
notice (`Loading the preview…`) when a preview takes longer than 0.4 s to start, and the offline
or failed-load notice. A snippet notice is taken back once the snippet leaves that state, for
example when the slow preview starts playing: the region is cleared, unless a newer message
has replaced the notice. The region clears itself before every message, so repeating the same
text is spoken again. The countdown is a `timer` with `aria-live="off"`, so it never interrupts.

## Focus, sheets and the page

The Statistics and About sheets are dialogs that trap focus; focus moves into the sheet when it
opens and returns to the button that opened it when it closes (Close button, Escape or a pointer
press on the backdrop). The page keeps its reading order as its focus order; nothing is positioned
out of flow. The focus ring is a 2 px outline with a 2 px offset: Royal `#1F47C4` on the light
theme and Mint `#06F2C4` on the dark theme, both well above the 3:1 ratio against every surface.

## Reduced motion

With `prefers-reduced-motion: reduce` the snippet progress bar updates in steps from the reported
playback position instead of animating, the sheets open and close without a fade, and the style
sheet cuts every CSS animation and transition to 0.001 ms. Manual check: set the
operating system's reduce-motion option, reload, press play and watch the bar move in steps; open
Statistics and see it appear at once.

## Themes and contrast

The game follows the system colour scheme and offers a manual choice (System, Light, Dark) in the
About sheet, stored in the browser. Every colour comes from the palette tokens, and every text pair
was checked against WCAG 2.x: body, secondary and muted text are at or above 4.5:1 on their
surfaces, buttons and borders at or above 3:1, in both themes. The unit test `src/__tests__/theme.test.ts`
recomputes the ratios, so a palette change that drops below the limits fails `npm test`.

## How it is tested

`e2e/a11y.spec.ts` runs axe (WCAG 2.0 and 2.1, levels A and AA) on the main screen in both
themes, on the open song list, on the reveal, and on the Statistics and About sheets, and fails on
any serious or critical violation. `e2e/daily-round.spec.ts` wins a round with the keyboard only.
The share text is plain text (`FiveGuesses #58 3/5`, then one line with the seconds and a glyph
per guess, then `fiveguesses.app`), so a screen reader reads it as written.

## Known limits

- Screen readers were not tested by hand on every platform; the automated checks and the roles
  above are what is verified. Reports are welcome in the issues.
- The static privacy page (`/legal/`) follows the system colour scheme only; the manual theme
  choice of the game does not apply there.
