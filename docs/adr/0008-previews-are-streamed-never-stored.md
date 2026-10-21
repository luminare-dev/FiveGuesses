# 0008. Previews are streamed, never stored

- **Status:** accepted
- **Date:** 2026-10-21

## Context

The game plays the first seconds of a song. The 30-second previews that the public iTunes Search
API returns are promotional clips served by Apple; using them means streaming them from Apple's
host and crediting the source. The game also shows the album artwork and a link to the song page.
The privacy rule of the project is that nothing goes to another host unless the player asks for it.

## Considered options

1. Stream the preview from `audio-ssl.itunes.apple.com` when the player presses play, never cache it.
2. Download or re-host the previews.
3. Use another preview source.

## Decision

Option 1. The audio element is created without a source; the preview URL is set and played inside
the press handler of the play button, so no request leaves the page before the first press. The
artwork (`*.mzstatic.com`) is loaded only on the reveal, and "Listen on Apple Music" opens
`music.apple.com` in a new tab. The line "Previews courtesy of Apple Music" is shown wherever a
preview plays, in the About sheet, in the footer and on the privacy page. The service worker never
caches a cross-origin response (ADR 0009), and the Content-Security-Policy in `.htaccess` lists
exactly these hosts (`media-src`, `img-src`) and no other. The song-page links are the ones the
search API returns; the project adds no parameter of its own. Option 2 is out because the clips are
not the project's to store; option 3 is out because the iTunes Search API already gives the seed
script the preview, the artwork and the song-page link in one response, and no second source was
evaluated.

## Consequences

- Good: no audio file in the repository or on the server, and the privacy page can name the one
  outside party and the moment it is contacted.
- Bad: the audio needs a connection and depends on Apple keeping the preview paths stable; the seed
  script regenerates `assets/songs.json`, and the UI says when a preview cannot be loaded.
