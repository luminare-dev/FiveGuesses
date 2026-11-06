import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

// The height of the part of the page the player can see: on web the visual viewport, which
// shrinks while the on-screen keyboard is up (the layout viewport, and with it vh and dvh, does
// not on iOS Safari or on Chrome for Android), else the window. Rounded down to 8 px, so a
// keyboard sliding in re-renders a few times rather than on every frame.
export function useVisibleHeight(): number {
  const { height: windowHeight } = useWindowDimensions();
  const [visible, setVisible] = useState<number | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const viewport = window.visualViewport;
    if (viewport == null) return undefined;
    const update = () => setVisible(Math.floor(viewport.height / 8) * 8);
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);
  return visible ?? Math.floor(windowHeight / 8) * 8;
}

// Web: scrolls the page so that top and bottom (the guess box and its open list) sit inside the
// visible part of the page, above the keyboard, with a margin. When both do not fit, top wins.
// The page scrolls in its own box (Page), so the nearest scrolling ancestor is moved.
export function revealInViewport(top: HTMLElement, bottom: HTMLElement, margin = 12): void {
  const viewport = window.visualViewport;
  const bandTop = viewport?.offsetTop ?? 0;
  const bandBottom = bandTop + (viewport?.height ?? window.innerHeight);
  const topEdge = top.getBoundingClientRect().top;
  const bottomEdge = bottom.getBoundingClientRect().bottom;
  let delta = 0;
  if (bottomEdge + margin > bandBottom) delta = bottomEdge + margin - bandBottom;
  if (topEdge - delta - margin < bandTop) delta = topEdge - margin - bandTop;
  if (Math.abs(delta) < 1) return;
  let box: HTMLElement | null = top.parentElement;
  while (box !== null) {
    const { overflowY } = getComputedStyle(box);
    if ((overflowY === 'auto' || overflowY === 'scroll') && box.scrollHeight > box.clientHeight) break;
    box = box.parentElement;
  }
  (box ?? document.scrollingElement ?? document.documentElement).scrollBy({ top: delta });
}
