import { useWindowDimensions } from 'react-native';

// Window widths where the layout changes. Below TWO_COLUMNS everything is one centred column;
// from there the modes sit in a side column next to the game (landscape phones included).
export const TWO_COLUMNS = 840;
// The widest the content gets: one column, and the two columns together.
export const COLUMN_MAX = 600;
export const PAGE_MAX = 1080;
// The side column's width in the two-column layout.
export const SIDE_WIDTH = 300;

export type Layout = {
  width: number;
  height: number;
  twoColumns: boolean;
  // A phone in portrait: the mode tiles go two by two and drop their descriptions.
  compact: boolean;
};

// The layout for the current window, recomputed when it is resized or turned.
export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return { width, height, twoColumns: width >= TWO_COLUMNS, compact: width < 560 };
}
