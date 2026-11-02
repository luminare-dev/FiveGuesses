// fiveguesses-api: song sources, playlist import and duel rooms for fiveguesses.app.
import { handle } from './http.mjs';

export { Room } from './room.mjs';

export default {
  fetch(request, env) {
    let cache;
    try {
      cache = caches.default;
    } catch {}
    return handle(request, env, {
      fetch: (u, i) => fetch(u, i),
      now: Date.now,
      random: Math.random,
      rooms: env.ROOMS,
      cache,
    });
  },
};
