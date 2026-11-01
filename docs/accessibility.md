# Accessibility

A whole round can be played with the keyboard and a screen reader. The organization's
[accessibility statement](https://github.com/luminare-dev/.github/blob/main/ACCESSIBILITY.md)
also applies.

## Keyboard

Tab order on the main screen: Statistics, About, the play button, the guess box, Skip, Guess, then
the footer links. After a round, the reveal adds Listen on Apple Music, Share result and the
free-round buttons after the play button.

| Key in the guess box | List closed | List open |
|---|---|---|
| Typing | updates the search; from two characters the list opens when a song matches | the same |
| ArrowDown | opens the list and highlights the first song | moves the highlight down |
| ArrowUp | nothing | moves the highlight up |
| Home, End | move the caret | highlight the first or the last song |
| Enter | guesses an exact match, otherwise announces "No matching song" | guesses the highlighted song |
| Escape | clears the text | closes the list and keeps the text |

Buttons react to Enter and Space. The Statistics and About sheets trap focus, close with Escape and
return focus to the button that opened them. The theme choice in About is a radio group.

## Screen readers, motion and colour

Round events are announced once through a polite live region; the countdown is not announced while
it ticks. No state is shown by colour alone: each board row has its own glyph and wording. With
`prefers-reduced-motion: reduce` the progress bar moves in steps and the sheets don't fade. Both
themes meet WCAG contrast (4.5:1 for text, 3:1 for controls); `src/__tests__/theme.test.ts` checks
the palette and `e2e/a11y.spec.ts` runs axe on the main screens.

The privacy page (`/legal/`) follows the system colour scheme only.
