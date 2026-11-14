// The one state store. Every module reads or writes through this object, so the
// whole match — phase, health, money, spike, grenades, score — lives in one place
// and a round reset touches every field in one function.
export function createGameState() {
  const state = {
    time: 0,
    health: 100,
    armor: 0,
    alive: true,
    owned: new Set(['kestrel']),
    grenades: 0,
    kills: 0,
    deaths: 0,
    damageFlash: 0,
    plantHeld: 0,
    defuseHeld: 0,
    grenade: null, // {x,y,z,vx,vy,vz,fuse} or null
    noise: null, // {x, z, time} — the last loud sound bots heard
    feed: [], // kill-feed entries, newest first, capped in hud.js
    started: false,
    buyOpen: false,
  };

  return {
    state,
    resetRound() {
      state.health = 100;
      state.alive = true;
      state.damageFlash = 0;
      state.plantHeld = 0;
      state.defuseHeld = 0;
      state.grenade = null;
      state.noise = null;
    },
    resetMatch() {
      this.resetRound();
      state.armor = 0;
      state.owned = new Set(['kestrel']);
      state.grenades = 0;
      state.kills = 0;
      state.deaths = 0;
      state.feed = [];
      state.buyOpen = false;
    },
    addFeed(text, team) {
      state.feed.unshift({ text, team, at: state.time });
      if (state.feed.length > 5) state.feed.length = 5;
    },
  };
}
