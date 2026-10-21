import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isValidElement } from 'react';
import { en } from '../i18n/en';
import { MessageKey, t, tNodes } from '../i18n';

const ROOT = join(__dirname, '..', '..');
const KEYS = Object.keys(en) as MessageKey[];

// Keys that the UI reaches through a switch instead of a literal; the scan below cannot see
// them. Empty once every key is read with a literal.
const USED_INDIRECTLY: MessageKey[] = [];

// Every app source file: src/**/*.ts and *.tsx without the tests and the dictionary itself, plus
// the composition root App.tsx at the repository root.
function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const rel = relative(ROOT, path).split(sep).join('/');
      if (rel.startsWith('src/__tests__') || rel.startsWith('src/i18n')) continue;
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.tsx?$/.test(name)) files.push(path);
    }
  };
  walk(join(ROOT, 'src'));
  files.push(join(ROOT, 'App.tsx'));
  return files;
}

const sources = sourceFiles().map((path) => ({
  path: relative(ROOT, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}));

describe('t', () => {
  it('fills a numeric placeholder', () => {
    expect(t('app.subtitle.daily', { puzzle: 58 })).toBe('Daily #58 · Name the song');
  });
  it('fills several placeholders', () => {
    expect(t('snippet.status', { seconds: 1, next: 2 })).toBe('1s unlocked · next: 2s');
  });
  it('reads the playing status without a plural on the one-second tier', () => {
    expect(t('snippet.playing', { seconds: 1 })).toBe('Playing the 1-second snippet');
  });
  it('fills a text placeholder', () => {
    expect(t('footer.copyright', { studio: 'X' })).toBe('© 2026 X');
  });
  it('keeps a placeholder that has no parameter', () => {
    expect(t('snippet.play', {})).toBe('Play the {seconds}-second snippet');
    expect(t('snippet.play')).toBe('Play the {seconds}-second snippet');
  });
  it('returns a plain message unchanged', () => {
    expect(t('app.title')).toBe('FiveGuesses');
  });
});

describe('tNodes', () => {
  it('puts the node into its slot and keeps the text around it', () => {
    const nodes = tNodes('footer.copyright', { studio: 'X' });
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toBe('© 2026 ');
    expect(isValidElement(nodes[1])).toBe(true);
    expect((nodes[1] as { props: { children: unknown } }).props.children).toBe('X');
  });
  it('keeps a slot without a node as text', () => {
    expect(tNodes('footer.copyright', {})).toEqual(['© 2026 ', '{studio}']);
  });
  it('returns a message without placeholders as one text part', () => {
    expect(tNodes('app.title', {})).toEqual(['FiveGuesses']);
  });
});

describe('the dictionary', () => {
  it('has at least one key', () => {
    expect(KEYS.length).toBeGreaterThan(0);
  });
  test.each(KEYS)('%s is a well-formed message', (key) => {
    const value: string = en[key];
    expect(key).toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
    expect(value.length).toBeGreaterThan(0);
    expect(value).not.toContain('{{');
    expect(value).not.toContain('}}');
    expect(value).toBe(value.trim());
    for (const match of value.match(/\{[^}]*\}/g) ?? []) {
      expect(match).toMatch(/^\{[a-z]+\}$/);
    }
  });
});

describe('dictionary usage in the source', () => {
  const LITERAL_USE = /(?<![\w$.])t(?:Nodes)?\(\s*'([^']+)'/g;
  const SATISFIES_USE = /'([^']+)'\s+satisfies\s+MessageKey\b/g;
  const DYNAMIC_USE = /(?<![\w$.])t(?:Nodes)?\(\s*[^'")\s]/;

  const used = new Map<string, string[]>();
  for (const { path, text } of sources) {
    for (const match of text.matchAll(LITERAL_USE)) used.set(match[1], [...(used.get(match[1]) ?? []), path]);
    for (const match of text.matchAll(SATISFIES_USE)) used.set(match[1], [...(used.get(match[1]) ?? []), path]);
  }

  it('scans the app source files', () => {
    expect(sources.map((s) => s.path)).toContain('App.tsx');
    expect(sources.length).toBeGreaterThan(1);
  });
  it('reads only keys that exist', () => {
    const unknown = [...used.keys()].filter((key) => !(key in en));
    expect(unknown).toEqual([]);
  });
  it('uses every key', () => {
    const unused = KEYS.filter((key) => !used.has(key) && !USED_INDIRECTLY.includes(key));
    expect(unused).toEqual([]);
  });
  it('lists only unread keys as used indirectly', () => {
    const stale = USED_INDIRECTLY.filter((key) => used.has(key));
    expect(stale).toEqual([]);
  });
  it('never builds a key at run time', () => {
    const dynamic = sources.filter(({ text }) => DYNAMIC_USE.test(text)).map(({ path }) => path);
    expect(dynamic).toEqual([]);
  });
});
