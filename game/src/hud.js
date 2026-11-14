// The DOM HUD. It never touches the simulation: main.js pushes numbers in and
// reads callbacks out. Every readout is cached and only written when it changes,
// so the HUD costs nothing on a quiet frame.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';
import { TEAM } from './palette.js';

const COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'A container yard at dusk. Plant the spike at Foundry or Depot — or wipe the Ember squad. First to 5 rounds takes the yard.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  round: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud(callbacks) {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const healthBar = $('health-fill');
  const healthValue = $('health-value');
  const armorValue = $('armor-value');
  const moneyValue = $('money-value');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const grenadeValue = $('grenade-count');
  const timerValue = $('timer-value');
  const scoreAzure = $('score-azure');
  const scoreEmber = $('score-ember');
  const roundValue = $('round-value');
  const objective = $('objective');
  const aliveAzure = $('alive-azure');
  const aliveEmber = $('alive-ember');
  const feedList = $('feed');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const damageVignette = $('damage');
  const progressWrap = $('progress-wrap');
  const progressLabel = $('progress-label');
  const progressFill = $('progress-fill');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const buyGrid = $('buy-grid');
  const banner = $('banner');

  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;

  function setText(element, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    element.textContent = value;
  }

  // Build the buy menu once from the weapon table.
  const buyButtons = {};
  function buyCard(id, name, detail, price, key) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-card';
    button.innerHTML = `<span class="buy-key">${key}</span><span class="buy-name">${name}</span><span class="buy-detail">${detail}</span><span class="buy-price">$${price}</span>`;
    button.addEventListener('click', () => callbacks.onBuy(id));
    buyGrid.appendChild(button);
    buyButtons[id] = button;
    return button;
  }
  buyCard('harrier', 'Harrier AR', 'Auto rifle · 33 dmg · 30 rounds', WEAPONS.harrier.price, '1');
  buyCard('wasp', 'Wasp SMG', 'Fast SMG · 22 dmg · 28 rounds', WEAPONS.wasp.price, '2');
  buyCard('longbow', 'Longbow DMR', 'Heavy marksman · 78 dmg · 8 rounds', WEAPONS.longbow.price, '3');
  buyCard('grenade', 'Frag grenade', 'Throw with G · blast damage', GRENADE_PRICE, '4');
  buyCard('armor', 'Kevlar vest', 'Absorbs half of each hit', ARMOR_PRICE, '5');
  $('buy-close').addEventListener('click', () => callbacks.onBuyClose());

  function refreshBuy(money, owned, grenades, hasArmor) {
    setText(buyMoney, 'buyMoney', `$${money}`);
    for (const [id, button] of Object.entries(buyButtons)) {
      const ownedNow = id === 'grenade' ? grenades >= 2 : id === 'armor' ? hasArmor : owned.has(id);
      const price = id === 'grenade' ? GRENADE_PRICE : id === 'armor' ? ARMOR_PRICE : WEAPONS[id].price;
      button.classList.toggle('owned', ownedNow);
      button.classList.toggle('poor', !ownedNow && money < price);
    }
  }

  return {
    setHealth(health) {
      setText(healthValue, 'health', String(Math.max(0, Math.ceil(health))));
      const pct = Math.max(0, Math.min(100, health));
      if (last.healthPct !== pct) {
        last.healthPct = pct;
        healthBar.style.width = `${pct}%`;
        healthBar.classList.toggle('low', pct <= 30);
      }
    },
    setArmor(armor) {
      setText(armorValue, 'armor', armor > 0 ? `Kevlar ${armor}` : 'No vest');
    },
    setMoney(money) {
      setText(moneyValue, 'money', `$${money}`);
    },
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setWeapon(name, grenades) {
      setText(weaponName, 'weapon', name);
      setText(grenadeValue, 'grenades', `◉ ${grenades}`);
    },
    setTimer(seconds, planted) {
      const total = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
      setText(timerValue, 'timer', text);
      $('timer').classList.toggle('planted', planted);
    },
    setScore(azure, ember, round) {
      setText(scoreAzure, 'scoreA', String(azure));
      setText(scoreEmber, 'scoreE', String(ember));
      setText(roundValue, 'round', `ROUND ${round}`);
    },
    setObjective(text) {
      setText(objective, 'objective', text);
    },
    setAlive(azure, ember) {
      setText(aliveAzure, 'aliveA', '●'.repeat(azure) + '○'.repeat(5 - azure));
      setText(aliveEmber, 'aliveE', '●'.repeat(ember) + '○'.repeat(5 - ember));
    },
    setCrosshairSpread(spread) {
      const px = Math.round(4 + spread * 900);
      if (last.spreadPx === px) return;
      last.spreadPx = px;
      crosshair.style.setProperty('--gap', `${px}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash(strength) {
      damageVignette.style.opacity = String(Math.min(0.85, strength));
    },
    showBanner(text, ms = 2600) {
      banner.textContent = text;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), ms);
    },
    addFeed(text, team) {
      const item = document.createElement('div');
      item.className = `feed-item ${team}`;
      item.textContent = text;
      feedList.prepend(item);
      while (feedList.children.length > 5) feedList.lastChild.remove();
    },
    clearFeed() {
      feedList.innerHTML = '';
    },
    clearBanner() {
      clearTimeout(bannerTimer);
      banner.classList.remove('on');
    },
    setProgress(label, fraction) {
      if (fraction <= 0) {
        progressWrap.hidden = true;
        return;
      }
      progressWrap.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    showBuy(money, owned, grenades, hasArmor) {
      buyMenu.hidden = false;
      refreshBuy(money, owned, grenades, hasArmor);
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    refreshBuy,
    showOverlay(mode, data = {}) {
      const text = COPY[mode];
      title.textContent = mode === 'round' ? (data.won ? 'Round won' : 'Round lost') : mode === 'match' ? (data.won ? 'Yard taken' : data.draw ? 'Dead even' : 'Yard lost') : text.title;
      if (mode === 'round') copy.textContent = `${data.reason} — ${TEAM.azure.name} ${data.scoreAzure} · ${data.scoreEmber} ${TEAM.ember.name}.`;
      else if (mode === 'match') copy.textContent = `${TEAM.azure.name} ${data.scoreAzure} · ${data.scoreEmber} ${TEAM.ember.name}. ${data.won ? 'The yard is yours.' : data.draw ? 'Nobody takes the yard.' : 'Ember holds the yard.'}`;
      else copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
