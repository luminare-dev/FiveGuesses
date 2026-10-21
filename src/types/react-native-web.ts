import type { Role } from 'react-native';

// react-native-web passes every aria-* attribute and any role string through to the DOM, while
// the React Native typings know only a subset. The interfaces below declare the ARIA attributes
// and the link props (href, hrefAttrs) that react-native-web supports and the typings lack, so a
// component that sets one needs no cast. The legacy role and label props are never used; role and
// aria-* work on web and on native alike.
declare module 'react-native' {
  interface AccessibilityProps {
    'aria-pressed'?: boolean;
    'aria-haspopup'?: boolean | 'listbox' | 'dialog';
    'aria-controls'?: string;
    'aria-activedescendant'?: string;
    'aria-autocomplete'?: 'list' | 'none';
    'aria-describedby'?: string;
    'aria-current'?: boolean | 'step';
    'aria-atomic'?: boolean;
  }
  interface TextProps {
    href?: string;
    hrefAttrs?: { target?: '_blank' | '_self'; rel?: string; download?: boolean };
    // -1 makes a heading a target for focus() without adding a Tab stop.
    tabIndex?: 0 | -1;
  }
  interface ViewProps {
    href?: string;
    hrefAttrs?: TextProps['hrefAttrs'];
  }
  interface PressableProps {
    href?: string;
    hrefAttrs?: TextProps['hrefAttrs'];
  }
}

// The Role union of React Native 0.86 has combobox, option, timer, status and radiogroup but no
// listbox; react-native-web renders the string as given.
export const LISTBOX_ROLE = 'listbox' as unknown as Role;
