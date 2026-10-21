import songsData from '../assets/songs.json';
import type { Song } from './game';

// The list is data, frozen so nothing can reorder or edit it at run time: the daily pick depends
// on the seed order.
export const SONGS: readonly Song[] = Object.freeze(
  songsData.songs.map((song): Song => Object.freeze({ ...song }))
);

export const SONG_COUNT: number = SONGS.length;
