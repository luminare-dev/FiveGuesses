// True when the focused element was removed and the browser fell back to the page body.
export function focusWasDropped(): boolean {
  if (typeof document === 'undefined') return false;
  return document.activeElement === null || document.activeElement === document.body;
}
