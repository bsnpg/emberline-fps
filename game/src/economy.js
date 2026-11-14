// The economy: money earned each round and spent in the buy menu. Win big, lose
// small, kill for a bonus, plant for a bonus — the same shape as the genre's
// classic, with original numbers. The buy menu only opens during the buy phase.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

export const START_MONEY = 800;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;

export function createEconomy() {
  const state = { money: START_MONEY, kills: 0, plants: 0 };

  function canAfford(cost) {
    return state.money >= cost;
  }

  // Returns the bought id, or null when the player cannot afford it / already owns it.
  function buyWeapon(id, owned) {
    const def = WEAPONS[id];
    if (!def) return null;
    if (owned.has(id)) return null;
    if (!canAfford(def.price)) return null;
    state.money -= def.price;
    owned.add(id);
    return id;
  }

  function buyGrenade(grenades) {
    if (grenades >= 2 || !canAfford(GRENADE_PRICE)) return false;
    state.money -= GRENADE_PRICE;
    return true;
  }

  function buyArmor(hasArmor) {
    if (hasArmor || !canAfford(ARMOR_PRICE)) return false;
    state.money -= ARMOR_PRICE;
    return true;
  }

  return {
    state,
    canAfford,
    buyWeapon,
    buyGrenade,
    buyArmor,
    resetMatch() {
      state.money = START_MONEY;
      state.kills = 0;
      state.plants = 0;
    },
    rewardKill() {
      state.money += KILL_REWARD;
      state.kills += 1;
    },
    rewardPlant() {
      state.money += PLANT_REWARD;
      state.plants += 1;
    },
    rewardRound(won) {
      state.money += won ? WIN_REWARD : LOSS_REWARD;
    },
  };
}
