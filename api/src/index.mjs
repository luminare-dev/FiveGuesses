// fiveguesses-api: song categories, playlist import and duel rooms for fiveguesses.app.
import { handle } from './http.mjs';

export { Room } from './room.mjs';

export default {
  fetch(request, env) {
    return handle(request, env, {
      fetch: (u, i) => fetch(u, i),
      now: Date.now,
      rooms: env.ROOMS,
    });
  },
};
