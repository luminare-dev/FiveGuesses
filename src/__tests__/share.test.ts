import { GuessEntry } from '../game';
import { shareResult, shareText } from '../share';

const wrong = (text: string): GuessEntry => ({ kind: 'wrong', text });
const partial = (text: string): GuessEntry => ({ kind: 'partial', text });
const skip: GuessEntry = { kind: 'skip' };
const correct: GuessEntry = { kind: 'correct', text: 'Dua Lipa – Levitating' };
const host = 'fiveguesses.app';

describe('shareText', () => {
  it('formats a win on the first guess', () => {
    expect(shareText({ puzzle: 58, entries: [correct], status: 'won', host })).toBe(
      'FiveGuesses #58 1/5\n1s ✓\nfiveguesses.app'
    );
  });
  it('lists the ladder of every used guess in order', () => {
    const entries = [wrong('A – B'), wrong('C – D'), skip, correct];
    expect(shareText({ puzzle: 58, entries, status: 'won', host })).toBe(
      'FiveGuesses #58 4/5\n1s ✕ · 2s ✕ · 4s » · 8s ✓\nfiveguesses.app'
    );
  });
  it('marks a loss with X and shows all five entries', () => {
    const entries = [wrong('A – B'), partial('C – D'), skip, wrong('E – F'), wrong('G – H')];
    expect(shareText({ puzzle: 58, entries, status: 'lost', host })).toBe(
      'FiveGuesses #58 X/5\n1s ✕ · 2s ≈ · 4s » · 8s ✕ · 16s ✕\nfiveguesses.app'
    );
  });
  it('uses the given host and the given puzzle number', () => {
    const text = shareText({ puzzle: 7, entries: [skip, correct], status: 'won', host: 'example.org' });
    expect(text.split('\n')).toEqual(['FiveGuesses #7 2/5', '1s » · 2s ✓', 'example.org']);
    expect(text.endsWith('\n')).toBe(false);
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});

describe('the share host', () => {
  const KEY = 'EXPO_PUBLIC_SITE_URL';
  const original = process.env[KEY];
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });
  it('defaults to fiveguesses.app', () => {
    delete process.env[KEY];
    jest.isolateModules(() => {
      const config = require('../config') as typeof import('../config');
      expect(config.SITE_URL).toBe('https://fiveguesses.app');
      expect(config.SITE_HOST).toBe('fiveguesses.app');
      expect(config.LEGAL_PATH).toBe('/legal/');
    });
  });
  it('follows EXPO_PUBLIC_SITE_URL', () => {
    process.env[KEY] = 'https://example.org/';
    jest.isolateModules(() => {
      const config = require('../config') as typeof import('../config');
      expect(config.SITE_HOST).toBe('example.org');
    });
  });
});

describe('shareResult', () => {
  it('reports a failure where neither a share sheet nor a clipboard exists', async () => {
    await expect(shareResult('FiveGuesses #58 1/5\n1s ✓\nfiveguesses.app')).resolves.toBe('failed');
  });
});
