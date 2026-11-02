import { csvRows, parseCsv, parseLine, parsePasted, sampleEntries } from '../catalog/importText';

describe('parseLine', () => {
  it('splits on the first dash of any kind or a tab', () => {
    expect(parseLine('a-ha - Take On Me')).toEqual({ artist: 'a-ha', title: 'Take On Me' });
    expect(parseLine('Oasis – Wonderwall')).toEqual({ artist: 'Oasis', title: 'Wonderwall' });
    expect(parseLine('Queen — Bohemian Rhapsody')).toEqual({ artist: 'Queen', title: 'Bohemian Rhapsody' });
    expect(parseLine('Adele\tHello')).toEqual({ artist: 'Adele', title: 'Hello' });
    expect(parseLine('Daft Punk - Get Lucky - Radio Edit')).toEqual({ artist: 'Daft Punk', title: 'Get Lucky - Radio Edit' });
  });
  it('drops the numbering in front', () => {
    expect(parseLine('1. Oasis - Wonderwall')).toEqual({ artist: 'Oasis', title: 'Wonderwall' });
    expect(parseLine('  01) Oasis - Wonderwall')).toEqual({ artist: 'Oasis', title: 'Wonderwall' });
  });
  it('reads "Title by Artist"', () => {
    expect(parseLine('Hey Jude by The Beatles')).toEqual({ artist: 'The Beatles', title: 'Hey Jude' });
  });
  it('skips a line without an artist', () => {
    expect(parseLine('Wonderwall')).toBeNull();
    expect(parseLine('')).toBeNull();
    expect(parseLine(' - Wonderwall')).toBeNull();
  });
});

describe('parsePasted', () => {
  it('reads one song per line and skips the rest', () => {
    const text = 'Oasis - Wonderwall\r\n\nnot a song\n2. Adele - Hello\n';
    expect(parsePasted(text)).toEqual([
      { artist: 'Oasis', title: 'Wonderwall' },
      { artist: 'Adele', title: 'Hello' },
    ]);
  });
  it('reads at most 2000 lines', () => {
    const text = Array.from({ length: 2500 }, (_, i) => `Artist ${i} - Song ${i}`).join('\n');
    expect(parsePasted(text)).toHaveLength(2000);
  });
});

describe('CSV', () => {
  it('handles quotes, doubled quotes, CRLF and a byte order mark', () => {
    expect(csvRows('﻿a,"b, c","say ""hi"""\r\nd,"multi\nline",f')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['d', 'multi\nline', 'f'],
    ]);
  });
  it('reads an Exportify export and keeps the first artist', () => {
    const csv = [
      '"Track URI","Track Name","Album Name","Artist Name(s)","Release Date"',
      '"spotify:track:1","Lean On (feat. MØ & DJ Snake)","Peace Is The Mission","Major Lazer,MØ,DJ Snake","2015-06-01"',
      '"spotify:track:2","Wonderwall - Remastered","(What\'s The Story) Morning Glory?","Oasis","1995-10-02"',
      '"spotify:track:3","","x","Nobody","2000"',
    ].join('\r\n');
    expect(parseCsv(csv)).toEqual([
      { artist: 'Major Lazer', title: 'Lean On (feat. MØ & DJ Snake)' },
      { artist: 'Oasis', title: 'Wonderwall - Remastered' },
    ]);
  });
  it('matches plain headers in any case', () => {
    expect(parseCsv('Song,Artists\nHello,Adele; Someone')).toEqual([{ artist: 'Adele', title: 'Hello' }]);
    expect(parseCsv('TITLE,ARTIST\r\nHello,Adele\r\n')).toEqual([{ artist: 'Adele', title: 'Hello' }]);
  });
  it('gives nothing without the columns', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([]);
    expect(parseCsv('')).toEqual([]);
  });
});

describe('sampleEntries', () => {
  const list = Array.from({ length: 100 }, (_, i) => ({ artist: `A${i}`, title: `T${i}` }));
  it('takes at most n, each song once', () => {
    const doubled = [...list, ...list.map((e) => ({ artist: e.artist.toLowerCase(), title: e.title.toUpperCase() }))];
    const sample = sampleEntries(doubled, 30, () => 0.5);
    expect(sample).toHaveLength(30);
    expect(new Set(sample.map((e) => e.artist.toLowerCase())).size).toBe(30);
  });
  it('keeps a short list whole', () => {
    expect(sampleEntries(list.slice(0, 3), 30, () => 0)).toHaveLength(3);
  });
  it('depends on the random source', () => {
    const a = sampleEntries(list, 5, () => 0.1).map((e) => e.title);
    const b = sampleEntries(list, 5, () => 0.9).map((e) => e.title);
    expect(a).not.toEqual(b);
  });
});
