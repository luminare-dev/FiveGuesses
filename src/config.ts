// Public addresses. EXPO_PUBLIC_SITE_URL is read at build time by the bundler and at run time in
// tests; the share text ends with the host of this address.
export const SITE_URL: string = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://fiveguesses.app';
export const SITE_HOST: string = new URL(SITE_URL).host;
export const PROJECT_PAGE_URL = 'https://luminare.tech/open-source/fiveguesses/';
export const SOURCE_URL = 'https://github.com/luminare-dev/FiveGuesses';
export const LEGAL_PATH = '/legal/';
// The rooms and song-list service (api/). Read with a literal process.env access so the bundler
// inlines it.
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.fiveguesses.app';
export const WS_URL: string = API_URL.replace(/^http/, 'ws');
