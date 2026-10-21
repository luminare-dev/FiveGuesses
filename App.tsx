import React from 'react';
import { AppShell } from './src/components/AppShell';
import { ThemeProvider } from './src/theme/ThemeProvider';

// Composition root: the theme provider around the one screen. No game logic lives here.
export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
