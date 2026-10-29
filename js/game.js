'use strict';

/* =========================================================
   GAME — progression, economy, summoning, records, save
   All content and rules are original to Lumentia.
   ========================================================= */

var Game = (function () {
  let state = null;
  let pendingOffline = null;
  let offlineShown = false;
  let lastTick = 0;
  let resetting = false;
  let loadedSave = null;
  let staleTab = false;

  function num(value, fallback) {
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  /* ---------------- state ---------------- */

  function getTodayStr() { return Challenge.day(); }

  function freshState() {
    const heroes = {};
    DEFAULT_PARTY.forEach(function (id) {
      heroes[id] = { lv: 1, star: 1, shards: 0 };
    });
    return {
      v: 2,
      gold: START_GOLD,
      growthPolicyVersion: Growth.POLICY,
      growthDaily: {date: getTodayStr(), earned: START_GOLD, fraction: 0, sources: {initial: START_GOLD}},
      balanceAdjustment: null,
      gems: START_GEMS,
      highest: 0,
      owned: DEFAULT_PARTY.slice(),
      heroes: heroes,
      party: DEFAULT_PARTY.slice(),
      stats: {
        summons: 0,
        bossKills: 0,
        ascends: 0,
        ssrAscends: 0,
        maxPower: 0,
        totalGold: 0
      },
      achievements: {},
      reports: [],
      freeTen: true,
      pity: 0,
      tutorial: false,
      sfx: true,
      run: null,
      rewardDays: {},
      migration: null,
      onboarding: {grown: false},
      dailyPlays: { date: getTodayStr(), count: 0 },
      lastSeen: Date.now(),
      createdAt: Date.now(),
      pending: null
    };
  }

  function getActiveSaveKey() {
    if (typeof Auth !== 'undefined') {
      const u = Auth.getCurrentUser();
      if (u) return Auth.getSaveKeyForUser(u);
    }
    return SAVE_KEY;
  }

  function load() {
    let raw = null;
    const key = getActiveSaveKey();
    try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
    loadedSave = raw;
    if (!raw) return freshState();

    let data;
    try { data = JSON.parse(raw); } catch (e) { return freshState(); }
    if (!data || typeof data !== 'object') return freshState();

    const s = freshState();
    s.gold = Math.max(0, Math.floor(num(data.gold, s.gold)));
    s.gems = Math.max(0, Math.floor(num(data.gems, s.gems)));
    s.highest = Math.max(0, Math.floor(num(data.highest, 0)));
    s.freeTen = data.freeTen !== false;
    s.pity = Math.max(0, Math.min(GACHA.pity, Math.floor(num(data.pity, 0))));
    s.tutorial = !!data.tutorial;
    s.sfx = data.sfx !== false;
    s.onboarding = {grown: !!(data.onboarding && data.onboarding.grown)};
    s.lastSeen = num(data.lastSeen, Date.now());
    s.createdAt = num(data.createdAt, Date.now());

    if (Array.isArray(data.reports)) {
      s.reports = data.reports.filter(function (r) {
        return r && typeof r === 'object' && isFinite(Number(r.amount)) && Number(r.amount) > 0;
      }).slice(-60).map(function (r) {
        return {
          t: num(r.t, Date.now()),
          amount: Math.min(BALANCE.maxReward, Math.max(0, Math.floor(num(r.amount, 0)))),
          label: typeof r.label === 'string' ? r.label.slice(0, 24) : '미소 보상'
        };
      });
    }

    const owned = Array.isArray(data.owned) ? data.owned.filter(function (id) {
      return !!HERO_BY_ID[id];
    }) : [];
    s.owned = owned.filter(function (id, i, arr) { return arr.indexOf(id) === i; });
    if (!s.owned.length) s.owned = DEFAULT_PARTY.slice();

    const heroes = {};
    s.owned.forEach(function (id) {
      const src = data.heroes && data.heroes[id] ? data.heroes[id] : {};
      const star = Math.max(1, Math.min(BALANCE.maxStar, Math.floor(num(src.star, 1))));
      const cap = heroLevelCap(star);
      heroes[id] = {
        lv: Math.max(1, Math.min(cap, Math.floor(num(src.lv, 1)))),
        star: star,
        shards: Math.max(0, Math.floor(num(src.shards, 0)))
      };
    });
    s.heroes = heroes;
    if (s.owned.some(function (id) { return heroes[id].lv > 1; })) s.onboarding.grown = true;

    let party = Array.isArray(data.party) ? data.party.filter(function (id) {
      return s.owned.indexOf(id) >= 0;
    }) : [];
    party = party.filter(function (id, i, arr) { return arr.indexOf(id) === i; }).slice(0, 3);
    if (!party.length) party = s.owned.slice(0, 3);
    s.party = [0, 1, 2].map(function (i) { return party[i] || null; });

    const stats = data.stats && typeof data.stats === 'object' ? data.stats : {};
    Object.keys(s.stats).forEach(function (key) {
      s.stats[key] = Math.max(0, Math.floor(num(stats[key], s.stats[key])));
    });

    const ach = data.achievements && typeof data.achievements === 'object' ? data.achievements : {};
    ACHIEVEMENTS.forEach(function (a) {
      if (ach[a.id]) s.achievements[a.id] = true;
    });

    if (data.pending && typeof data.pending === 'object') {
      const gold = Math.min(BALANCE.maxReward, Math.max(0, Math.floor(num(data.pending.gold, 0))));
      const seconds = Math.max(0, Math.floor(num(data.pending.seconds, 0)));
      if (gold > 0) s.pending = { gold: gold, seconds: seconds };
    }

    Challenge.migrate(data, s, getDeviceDailyUsed(getTodayStr()), getLegacyDailyReward(getTodayStr()));
    Growth.migrate(data, s);
    Challenge.expire(s);
    if (data.v !== 2) {
      // Keep the exact original save before making the one-time balance correction.
      try {
        const backupKey = key + '.before-v2';
        if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, raw);
      } catch (e) { throw new Error('기존 기록을 백업할 공간이 부족합니다. 저장 공간을 확보해 주세요.'); }
    }
    if (data.growthPolicyVersion !== Growth.POLICY) {
      try {
        const growthBackup = key + '.before-growth-cap-v1';
        if (!localStorage.getItem(growthBackup)) localStorage.setItem(growthBackup, raw);
      } catch (e) { throw new Error('보정 전 기록을 백업하지 못했습니다. 저장 공간을 확보해 주세요.'); }
    }
    return s;
  }

  function save() {
    if (!state || resetting || staleTab || !Auth.getCurrentUser()) return false;
    try {
      if (localStorage.getItem(getActiveSaveKey()) !== loadedSave) {
        staleTab = true;
        if (typeof Battle !== 'undefined') Battle.pause();
        if (window.UI) UI.openSyncNotice();
        return false;
      }
    } catch (e) { return false; }
    if (typeof Battle !== 'undefined' && state.run && state.run.status === 'active') {
      const snapshot = Battle.snapshot();
      if (snapshot) state.run.snapshot = snapshot;
    }
    state.lastSeen = Date.now();
    try {
      const serialized = JSON.stringify(state);
      localStorage.setItem(getActiveSaveKey(), serialized);
      loadedSave = serialized;
      return true;
    }
    catch (e) {
      if (typeof Battle !== 'undefined') Battle.pause();
      if (window.UI) UI.toast('저장 공간이 부족해 일시 정지했습니다. 공간을 확보한 뒤 새로고침하세요.', 'bad');
      return false;
    }
  }

  /* ---------------- economy ---------------- */

  function goldRate(n) {
    n = Math.max(0, Math.floor(num(n, 0)));
    return BALANCE.goldPerSec * Math.pow(BALANCE.goldPerSecGrowth, n);
  }

  function currentStage() { return state && state.run ? state.run.stage : 1; }
  function growthStatus() { return Growth.status(state); }
  function creditGrowth(amount, source) { return Growth.credit(state, amount, source); }

  function smileCap(raw) {
    return Math.max(0, Math.min(BALANCE.maxReward, Math.round(num(raw, 0))));
  }

  function reportSmile(amount, label) {
    // Growth income is never a teacher claim. Keep only a local growth history.
    if (!state || amount <= 0) return;
    state.reports.push({t: Date.now(), amount: smileCap(amount), label: label || '성장 미소'});
    state.reports = state.reports.slice(-60);
  }

  function levelCostOf(hero, lv) {
    return Math.floor(
      BALANCE.levelCostBase *
      Math.pow(BALANCE.levelCostGrowth, Math.max(0, lv - 1)) *
      RARITY[hero.rarity].levelCost
    );
  }

  function ascendGoldOf(hero, star) {
    return Math.floor(
      BALANCE.ascendGoldBase *
      Math.pow(BALANCE.ascendGoldGrowth, Math.max(0, star - 1)) *
      RARITY[hero.rarity].levelCost
    );
  }

  /* ---------------- combat stats ---------------- */

  function computeStats(hero, lv, star) {
    const g = Math.pow(BALANCE.statGrowth, Math.max(0, lv - 1));
    const sm = Math.pow(BALANCE.starMult, Math.max(0, star - 1));
    const rm = RARITY[hero.rarity].statMul;
    let hp = hero.base.hp * g * sm * rm;
    let atk = hero.base.atk * g * sm * rm;
    let def = hero.base.def * g * sm * rm;
    let crit = 0;

    const p = hero.passive;
    if (p && p.kind === 'self') {
      if (p.stat === 'hp') hp *= 1 + p.value;
      else if (p.stat === 'atk') atk *= 1 + p.value;
      else if (p.stat === 'def') def *= 1 + p.value;
      else if (p.stat === 'crit') crit += p.value;
    }

    return { hp: hp, atk: atk, def: def, interval: hero.base.interval, crit: crit };
  }

  function getPartyCombat() {
    if (!state) return [];
    const list = [];
    state.party.forEach(function (id) {
      if (!id) return;
      const hero = HERO_BY_ID[id];
      const hs = state.heroes[id];
      if (!hero || !hs) return;
      list.push({ id: id, hero: hero, stats: computeStats(hero, hs.lv, hs.star) });
    });

    const auras = list.filter(function (e) {
      return e.hero.passive && e.hero.passive.kind === 'aura';
    });
    if (auras.length) {
      list.forEach(function (e) {
        auras.forEach(function (a) {
          const p = a.hero.passive;
          if (p.stat === 'atk') e.stats.atk *= 1 + p.value;
          else if (p.stat === 'hp') e.stats.hp *= 1 + p.value;
          else if (p.stat === 'def') e.stats.def *= 1 + p.value;
        });
      });
    }
    return list;
  }

  function partyPower() {
    if (!state) return 0;
    const list = getPartyCombat();
    let total = 0;
    list.forEach(function (e) {
      total += e.stats.atk * 5 + e.stats.def * 4 + e.stats.hp * 0.55;
    });
    const power = Math.round(total);
    if (power > state.stats.maxPower) state.stats.maxPower = power;
    return power;
  }

  /* ---------------- hero sheet ---------------- */

  function heroInfo(id) {
    if (!state) return null;
    const hero = HERO_BY_ID[id];
    const hs = state.heroes[id];
    if (!hero || !hs) return null;

    const cap = heroLevelCap(hs.star);
    const stats = computeStats(hero, hs.lv, hs.star);
    const maxStar = hs.star >= BALANCE.maxStar;
    const need = maxStar ? 0 : RARITY[hero.rarity].shardCosts[hs.star - 1];
    const gold = maxStar ? 0 : ascendGoldOf(hero, hs.star);

    return {
      lv: hs.lv,
      star: hs.star,
      shards: hs.shards,
      cap: cap,
      stats: {
        hp: Math.round(stats.hp),
        atk: Math.round(stats.atk),
        def: Math.round(stats.def),
        interval: stats.interval,
        crit: stats.crit
      },
      levelCost: levelCostOf(hero, hs.lv),
      ascend: {
        need: need,
        have: hs.shards,
        gold: gold,
        max: maxStar,
        can: !maxStar && hs.shards >= need && state.gold >= gold
      },
      inParty: state.party.indexOf(id) >= 0
    };
  }

  function afterGrowth() {
    state.onboarding.grown = true;
    partyPower();
    if (typeof Battle !== 'undefined') Battle.syncParty();
    save();
  }

  function canLevelAny(id) {
    if (!state) return false;
    const hero = HERO_BY_ID[id];
    const hs = state.heroes[id];
    if (!hero || !hs) return false;
    return hs.lv < heroLevelCap(hs.star) && state.gold >= levelCostOf(hero, hs.lv);
  }

  function levelHero(id, mode) {
    if (!state) return { levels: 0, reason: '게임을 불러오지 못했습니다' };
    const hero = HERO_BY_ID[id];
    const hs = state.heroes[id];
    if (!hero || !hs) return { levels: 0, reason: '보유하지 않은 영웅입니다' };

    const from = hs.lv;
    const cap = heroLevelCap(hs.star);
    if (from >= cap) {
      return { levels: 0, from: from, to: from, reason: '레벨 상한입니다 · 각성이 필요합니다' };
    }

    const limit = mode === 'max' ? cap : Math.max(1, Math.min(100, Math.floor(num(mode, 1))));
    let levels = 0;
    let spent = 0;
    while (levels < limit && hs.lv < cap) {
      const cost = levelCostOf(hero, hs.lv);
      if (state.gold < cost) break;
      state.gold -= cost;
      spent += cost;
      hs.lv += 1;
      levels += 1;
    }

    if (levels > 0) {
      afterGrowth();
      return { levels: levels, from: from, to: hs.lv, spent: spent };
    }
    return {
      levels: 0,
      from: from,
      to: from,
      reason: '미소가 부족합니다 · ' + fmt(levelCostOf(hero, hs.lv)) + ' 필요'
    };
  }

  function levelPartyBulk() {
    if (!state) return { levels: 0, reason: '게임을 불러오지 못했습니다' };
    let levels = 0;
    let spent = 0;

    for (let guard = 0; guard < 400; guard++) {
      let best = null;
      state.party.forEach(function (id) {
        if (!id) return;
        const hero = HERO_BY_ID[id];
        const hs = state.heroes[id];
        if (!hero || !hs || hs.lv >= heroLevelCap(hs.star)) return;
        const cost = levelCostOf(hero, hs.lv);
        if (state.gold >= cost && (!best || cost < best.cost)) {
          best = { hero: hero, hs: hs, cost: cost };
        }
      });
      if (!best) break;
      state.gold -= best.cost;
      spent += best.cost;
      best.hs.lv += 1;
      levels += 1;
    }

    if (levels > 0) {
      afterGrowth();
      return { levels: levels, spent: spent };
    }
    return { levels: 0, reason: '강화할 수 있는 미소가 부족합니다' };
  }

  function ascendHero(id) {
    if (!state) return { ok: false, reason: '게임을 불러오지 못했습니다' };
    const hero = HERO_BY_ID[id];
    const hs = state.heroes[id];
    if (!hero || !hs) return { ok: false, reason: '보유하지 않은 영웅입니다' };
    if (hs.star >= BALANCE.maxStar) return { ok: false, reason: '최대 각성 상태입니다' };

    const need = RARITY[hero.rarity].shardCosts[hs.star - 1];
    const gold = ascendGoldOf(hero, hs.star);
    if (hs.shards < need) {
      return { ok: false, reason: '조각이 부족합니다 · ' + hs.shards + ' / ' + need };
    }
    if (state.gold < gold) {
      return { ok: false, reason: '미소가 부족합니다 · ' + fmt(gold) + ' 필요' };
    }

    hs.shards -= need;
    state.gold -= gold;
    hs.star += 1;
    state.stats.ascends += 1;
    if (hero.rarity === 'SSR') state.stats.ssrAscends += 1;

    afterGrowth();
    if (window.UI) UI.renderHUD();
    return { ok: true, star: hs.star };
  }

  function setPartySlot(slot, id) {
    if (!state) return false;
    if (state.owned.indexOf(id) < 0) return false;
    slot = Math.max(0, Math.min(2, Math.floor(num(slot, 0))));

    const prev = state.party[slot];
    const existing = state.party.indexOf(id);
    if (existing >= 0 && existing !== slot) {
      state.party[existing] = prev || null;
    }
    state.party[slot] = id;

    partyPower();
    if (typeof Battle !== 'undefined') Battle.syncParty();
    save();
    return true;
  }

  /* ---------------- summoning ---------------- */

  function rollRarity() {
    const roll = Math.random();
    if (roll < GACHA.rates.SSR) return 'SSR';
    if (roll < GACHA.rates.SSR + GACHA.rates.SR) return 'SR';
    return 'R';
  }

  function randomHeroOf(rarity) {
    const pool = HEROES.filter(function (h) { return h.rarity === rarity; });
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function summon(count, free) {
    if (!state) return { ok: false, reason: '게임을 불러오지 못했습니다' };
    count = count === 10 ? 10 : 1;

    if (free) {
      if (count !== 10 || !state.freeTen) {
        return { ok: false, reason: '초대 소환은 이미 사용했습니다' };
      }
    } else {
      const cost = count === 10 ? GACHA.cost10 : GACHA.cost1;
      if (state.gems < cost) {
        return { ok: false, reason: '별빛이 부족합니다 · ' + fmt(cost) + ' 필요' };
      }
      state.gems -= cost;
    }

    const rarities = [];
    let pityReset = false;
    for (let i = 0; i < count; i++) {
      state.pity += 1;
      let rarity;
      if (state.pity >= GACHA.pity) {
        rarity = 'SSR';
      } else {
        rarity = rollRarity();
      }
      if (rarity === 'SSR') {
        state.pity = 0;
        pityReset = true;
      }
      rarities.push(rarity);
    }

    if (count === 10 && rarities.indexOf('SSR') < 0 && rarities.indexOf('SR') < 0) {
      rarities[count - 1] = 'SR';
    }

    const results = [];
    const fresh = [];
    let newCount = 0;
    let shardsTotal = 0;

    rarities.forEach(function (rarity) {
      const hero = randomHeroOf(rarity);
      let isNew = state.owned.indexOf(hero.id) < 0;
      let shards = 0;

      if (isNew) {
        state.owned.push(hero.id);
        state.heroes[hero.id] = { lv: 1, star: 1, shards: 0 };
        fresh.push(hero.id);
        newCount += 1;
      } else {
        shards = RARITY[rarity].dupShards;
        state.heroes[hero.id].shards += shards;
        shardsTotal += shards;
      }
      results.push({ heroId: hero.id, rarity: rarity, isNew: isNew, shards: shards });
    });

    let partyChanged = false;
    for (let slot = 0; slot < 3; slot++) {
      if (state.party[slot]) continue;
      const pickId = fresh.find(function (id) {
        return state.party.indexOf(id) < 0;
      }) || state.owned.find(function (id) {
        return state.party.indexOf(id) < 0;
      });
      if (!pickId) break;
      state.party[slot] = pickId;
      partyChanged = true;
    }

    if (free) state.freeTen = false;
    state.stats.summons += count;

    partyPower();
    if (partyChanged && typeof Battle !== 'undefined') Battle.syncParty();
    save();
    if (window.UI) UI.renderHUD();

    return {
      ok: true,
      results: results,
      free: !!free,
      pityLeft: Math.max(1, GACHA.pity - state.pity),
      pityReset: pityReset,
      summary: { newCount: newCount, shards: shardsTotal }
    };
  }

  /* ---------------- battle rewards ---------------- */

  function rewardKill(stage, isBoss) {
    if (!state || !state.run || state.run.status !== 'active') return 0;
    const gold = creditGrowth(smileCap(BALANCE.killGold * Math.pow(BALANCE.goldGrowth, Math.max(0, stage - 1)) * (isBoss ? BALANCE.bossGoldMult : 1)), 'kill');
    save();
    return gold;
  }

  function onBossKill() {
    if (!state) return;
    state.stats.bossKills += 1;
    if (window.UI) UI.renderHUD();
  }

  function stageCleared(stage, boss) {
    const run = state && state.run;
    if (!run || run.status !== 'active' || stage !== run.stage || stage <= run.cleared) return {gold: 0, gems: 0, points: 0, pot: 0};
    const first = stage > state.highest;
    const gold = smileCap(170 * Math.pow(BALANCE.goldGrowth, stage - 1));
    let gems = 0, shards = null;
    if (first) {
      state.highest = stage;
      gems = boss ? 45 : 15; state.gems += gems;
      if (stage % 10 === 0) {
        const pool = state.owned.filter(function (id) { return state.heroes[id].star < BALANCE.maxStar; });
        const id = pool[Math.floor(Math.random() * pool.length)];
        if (id) { const n = 10 + Math.floor(stage / 10) * 2; state.heroes[id].shards += n; shards = {name: HERO_BY_ID[id].name + ' 조각', amount: n}; }
      }
    }
    const credited = creditGrowth(gold, 'stage');
    const points = Challenge.accumulate(state, stage, gold);
    const result = {gold: credited, points: points, pot: run.pot, gems: gems, shards: shards};
    partyPower(); save();
    if (window.UI) UI.refreshAll();
    if (run.pot > 0 && run.pot >= Challenge.limit(run.date) - Challenge.allocated(state, run.date)) cashoutChallengePot();
    return result;
  }

  const DEVICE_DAILY_KEY = 'starlight_device_daily_v1_';
  function getDeviceDailyUsed(date) {
    try { return Challenge.integer(localStorage.getItem(DEVICE_DAILY_KEY + date), 2); } catch (e) { return 0; }
  }
  function setDeviceDailyUsed(date, used) {
    try { localStorage.setItem(DEVICE_DAILY_KEY + date, String(used)); } catch (e) { /* account save remains authoritative for this profile */ }
  }
  function getLegacyDailyReward(date) {
    try { return Challenge.integer(localStorage.getItem('starlight_device_daily_reward_v1_' + date), 20000); } catch (e) { return 0; }
  }
  function getDailyRewardClaimed(date) { return state ? Challenge.total(state, date || getTodayStr()) : 0; }
  function checkDailyPlays() {
    if (!state) return {available: 0, max: 2, used: 2, canPlay: false};
    const date = getTodayStr();
    const used = Math.max(Challenge.entry(state, date).used, getDeviceDailyUsed(date));
    return {available: Math.max(0, 2 - used), max: 2, used: used, canPlay: used < 2};
  }
  function getChallengePot() { return state && state.run && state.run.status === 'active' ? state.run.pot : 0; }
  function getDifficultyMultiplier() {
    const run = state && state.run;
    const nextPoints = smileCap(170 * Math.pow(BALANCE.goldGrowth, currentStage() - 1));
    const projected = run ? Challenge.allocated(state, run.date) + run.pot + nextPoints : 0;
    if (!run || run.status !== 'active' || projected < Challenge.HARD_REWARD_THRESHOLD) return {hpMult: 1, atkMult: 1, isHard: false, projected: projected};
    const baseline = run.baseline || combatBaseline();
    const excess = (projected - Challenge.HARD_REWARD_THRESHOLD) / 1000;
    return {
      hpMult: Math.min(80, 5 + excess * 7), atkMult: Math.min(60, 4 + excess * 5), isHard: true, projected: projected,
      enemyHpFloor: baseline.atk * (20 + excess * 8), enemyAtkFloor: baseline.hp * (0.18 + excess * 0.06)
    };
  }
  function combatBaseline() {
    const party = getPartyCombat();
    return {atk: party.reduce(function (sum, h) { return sum + h.stats.atk; }, 0), hp: party.reduce(function (sum, h) { return sum + h.stats.hp; }, 0) / Math.max(1, party.length)};
  }
  async function startChallenge() {
    const action = function () {
      if (!Auth.getCurrentUser()) return {ok: false, reason: '먼저 파수꾼으로 로그인하세요.'};
      // Refresh under a browser lock so two tabs cannot spend the same opportunity.
      state = load();
      staleTab = false;
      const before = JSON.stringify(state);
      const id = 'LMN-' + Date.now().toString(36) + '-' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
      const res = Challenge.begin(state, id, getDeviceDailyUsed(getTodayStr()));
      if (!res.ok) { if (window.UI) UI.toast(res.reason, 'bad'); return res; }
      state.run.baseline = combatBaseline();
      if (!save()) { state = JSON.parse(before); return {ok: false, reason: '도전을 저장하지 못했습니다.'}; }
      setDeviceDailyUsed(state.run.date, res.used);
      Battle.start();
      if (window.UI) { UI.closeModal(); UI.refreshAll(); }
      return res;
    };
    if (navigator.locks) return navigator.locks.request('lumentia-daily-challenge', action);
    return action();
  }
  function finishChallenge(outcome) {
    if (!state || !state.run || state.run.status !== 'active') return {ok: false, amount: 0, lost: 0};
    const before = JSON.stringify(state);
    const result = Challenge.finish(state, outcome);
    Battle.stop();
    if (!save()) { state = JSON.parse(before); return {ok: false, amount: 0, lost: 0}; }
    if (window.UI) { UI.refreshAll(); UI.openChallengeResult(result.run); }
    if (typeof Rewards !== 'undefined') Rewards.sync();
    return result;
  }
  function cashoutChallengePot() { return finishChallenge('cashed_out'); }
  function failChallengePot() { return finishChallenge('failed'); }
  function teacherLog(date) {
    if (!state) return [];
    const changed = Challenge.expire(state);
    if (changed) save();
    return Challenge.entry(state, date || getTodayStr()).records.map(function (r) { return typeof Rewards !== 'undefined' ? Rewards.decorate(r) : Object.assign({}, r); });
  }
  function recordCertificateCopy(date, ids) {
    if (!state || !Array.isArray(ids)) return false;
    const before = JSON.stringify(state);
    Challenge.expire(state);
    const eligible = Challenge.entry(state, date).records.filter(function (r) { return ids.indexOf(r.id) >= 0 && r.amount > 0; });
    if (!ids.length || eligible.length !== ids.length) return false;
    eligible.forEach(function (r) { if (!r.copiedAt) r.copiedAt = Date.now(); });
    if (save()) { if (typeof Rewards !== 'undefined') Rewards.sync(); return true; }
    state = JSON.parse(before); return false;
  }
  function recordClassTalkSubmission(date, ids) {
    if (!state || !Array.isArray(ids)) return false;
    const before = JSON.stringify(state);
    Challenge.expire(state);
    const rows = Challenge.entry(state, date).records;
    const eligible = rows.filter(function (r) { return ids.indexOf(r.id) >= 0 && r.amount > 0 && !r.claimedAt; });
    if (!ids.length || eligible.length !== ids.length) return false;
    // Record only the settlement IDs the student explicitly confirms sending to ClassTalk.
    rows.forEach(function (r) { if (ids.indexOf(r.id) >= 0 && r.amount > 0 && !r.claimedAt) { r.claimedAt = Date.now(); r.submissionChannel = 'classtalk'; } });
    if (save()) { if (typeof Rewards !== 'undefined') Rewards.sync(); return true; }
    state = JSON.parse(before);
    return false;
  }

  /* ---------------- achievements ---------------- */

  function maxHeroLevel() {
    let max = 0;
    Object.keys(state.heroes).forEach(function (id) {
      if (state.heroes[id].lv > max) max = state.heroes[id].lv;
    });
    return max;
  }

  function progressOf(a) {
    switch (a.type) {
      case 'stage': return state.highest;
      case 'summons': return state.stats.summons;
      case 'bossKills': return state.stats.bossKills;
      case 'maxLevel': return maxHeroLevel();
      case 'ascends': return state.stats.ascends;
      case 'owned': return state.owned.length;
      case 'power': return state.stats.maxPower;
      case 'ssrAscends': return state.stats.ssrAscends;
      default: return 0;
    }
  }

  function achievementState() {
    if (!state) return [];
    return ACHIEVEMENTS.map(function (a) {
      const raw = progressOf(a);
      return {
        id: a.id,
        icon: a.icon,
        title: a.title,
        desc: a.desc,
        target: a.target,
        progress: Math.min(raw, a.target),
        claimed: !!state.achievements[a.id],
        reward: a.reward
      };
    });
  }

  function hasClaimableAchievement() {
    if (!state) return false;
    return ACHIEVEMENTS.some(function (a) {
      return !state.achievements[a.id] && progressOf(a) >= a.target;
    });
  }

  function claimAchievement(id) {
    if (!state) return { ok: false };
    const a = ACHIEVEMENTS.find(function (x) { return x.id === id; });
    if (!a) return { ok: false };
    if (state.achievements[id]) return { ok: false, reason: '이미 수령한 보상입니다' };
    if (progressOf(a) < a.target) return { ok: false, reason: '아직 달성하지 못했습니다' };
    if (a.reward.gold && growthStatus().remaining < smileCap(a.reward.gold)) return {ok: false, reason: '오늘 성장 미소 획득 한도가 부족합니다. 이 임무는 내일 수령할 수 있어요.'};

    state.achievements[id] = true;
    if (a.reward.gems) state.gems += a.reward.gems;
    let smile = 0;
    if (a.reward.gold) {
      smile = creditGrowth(smileCap(a.reward.gold), 'mission');
    }
    save();
    if (smile > 0) reportSmile(smile, '임무 보상');
    return { ok: true, label: a.title, reward: Object.assign({}, a.reward, {gold: smile}) };
  }

  /* ---------------- offline / settings ---------------- */

  function computeOffline() {
    const last = num(state.lastSeen, Date.now());
    const elapsed = Math.max(0, (Date.now() - last) / 1000);
    const capped = Math.min(elapsed, BALANCE.offlineCapHours * 3600);
    let pending = state.pending;

    if (capped >= BALANCE.offlineMinSeconds) {
      const raw = Math.floor(goldRate(state.highest) * capped * BALANCE.offlineEfficiency);
      const total = Math.min(BALANCE.maxReward, raw + (pending ? pending.gold : 0));
      if (total > 0) {
        pending = {
          seconds: Math.floor(capped) + (pending ? pending.seconds : 0),
          gold: total
        };
      }
    }

    if (pending) pending.gold = Math.min(pending.gold, growthStatus().remaining);
    state.pending = pending && pending.gold > 0 ? pending : null;
    state.lastSeen = Date.now();
    save();
    return state.pending;
  }

  function claimOffline(info) {
    if (!state || !state.pending) return {gold: 0};
    const before = JSON.stringify(state);
    const gold = creditGrowth(smileCap(state.pending.gold), 'offline');
    state.pending = null;
    pendingOffline = null;
    partyPower();
    if (!save()) { state = JSON.parse(before); return {gold: 0}; }
    if (gold > 0) reportSmile(gold, '휴식 보상');
    if (window.UI) UI.renderHUD();
    return {gold: gold};
  }

  function startJourney() {
    if (!state) return;
    state.tutorial = true; save();
    if (window.UI) UI.refreshAll();
    if (pendingOffline) UI.openOffline(pendingOffline);
  }
  function acknowledgeBalanceAdjustment() {
    if (!state.balanceAdjustment || state.balanceAdjustment.acknowledgedAt) return true;
    state.balanceAdjustment.acknowledgedAt = Date.now();
    if (!save()) { state.balanceAdjustment.acknowledgedAt = 0; return false; }
    lastTick = performance.now();
    return true;
  }
  function showArrival() {
    function next() {
      if (!state.tutorial) UI.openWelcome();
      else if (pendingOffline) UI.openOffline(pendingOffline);
    }
    if (state.balanceAdjustment && !state.balanceAdjustment.acknowledgedAt) {
      if (state.run && state.run.status === 'active') { save(); Battle.pause(); }
      UI.openBalanceAdjustment(state.balanceAdjustment, function () {
        if (!acknowledgeBalanceAdjustment()) return;
        UI.closeModal();
        if (state.run && state.run.status === 'active') Battle.start();
        next();
      });
    } else next();
  }

  function setSfx(on) {
    if (!state) return;
    state.sfx = !!on;
    SFX.setEnabled(state.sfx);
    save();
  }

  function reset() {
    resetting = true;
    try { localStorage.removeItem(getActiveSaveKey()); } catch (e) { /* ignore */ }
    window.location.reload();
  }

  /* ---------------- loop / boot ---------------- */

  function startIdle() {
    lastTick = performance.now();
    setInterval(function () {
      if (!state || staleTab || !state.tutorial || !Auth.getCurrentUser() || document.visibilityState === 'hidden' || (state.balanceAdjustment && !state.balanceAdjustment.acknowledgedAt)) return;
      const now = performance.now();
      let dt = (now - lastTick) / 1000;
      lastTick = now;
      if (dt <= 0) return;
      if (dt > 5) dt = 5;
      creditGrowth(goldRate(state.highest) * dt, 'idle');
      if (window.UI && document.visibilityState !== 'hidden') UI.renderHUD();
    }, 500);
  }

  function bindPersistence() {
    setInterval(function () { if (document.visibilityState !== 'hidden') save(); }, 1000);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        save();
      } else {
        lastTick = performance.now();
      }
    });
  }

  function getGuideStep() {
    if (!state) return null;
    const active = state.run && state.run.status === 'active';
    Challenge.expire(state);
    const dates = Object.keys(state.rewardDays).sort().reverse();
    const pendingDate = dates.find(function (date) {
      return state.rewardDays[date].records.some(function (r) {
        if (r.amount <= 0 || r.claimedAt) return false;
        const row = typeof Rewards !== 'undefined' ? Rewards.decorate(r) : r;
        return (row.outstanding == null ? row.amount : row.outstanding) > 0 && !row.receivedAt && row.ledgerStatus !== 'requested';
      });
    });
    const hasCashedOut = dates.some(function (date) { return state.rewardDays[date].records.some(function (r) { return r.outcome === 'cashed_out' && (r.amount > 0 || r.expiredAmount > 0); }); });
    if (!active && state.freeTen) return {id:'summon_free', title:'1 / 5 · 동행 만나기', desc:'먼저 무료로 동행 10명을 만나보세요. 도전 횟수는 줄어들지 않아요.', action:'무료 동행 만나기', tab:'summon', target:'free_summon', focus:'btn-free-ten'};
    if (!active && !state.onboarding.grown) return {id:'first_growth', title:'2 / 5 · 동행 키우기', desc:'성장 미소로 동행을 강하게 만들어요. 아래 버튼으로 함께 레벨을 올려보세요.', action:'동행 함께 키우기', tab:'heroes', target:'growth', focus:'btn-bulk-level'};
    if (!active && pendingDate) return {id:'first_claim', title:'5 / 5 · 보상 청구하기', desc:'안전하게 받은 보상이 있어요! 인증서를 선생님 클래스톡으로 보내야 효력이 생겨요. 복사만으로는 제출되지 않아요. 72시간 안에 보내주세요.', action:'청구서 확인', tab:'battle', target:'cert', date:pendingDate, focus:'btn-top-cert'};
    if (!active) {
      if (!checkDailyPlays().canPlay) return {id:'daily_done', title:'오늘의 도전 완료', desc:'오늘 두 번의 도전을 마쳤어요. 영웅을 키우고 내일 다시 만나요!', action:'보상 기록 보기', target:'records', tab:'battle'};
      return {id:'challenge_start', title:'3 / 5 · 별길 도전', desc:'이제 도전 시작을 눌러보세요. 동행이 스스로 싸워요. 하루에 두 번 도전할 수 있어요.', action:'도전 시작', tab:'battle', target:'start', focus:'btn-start-challenge'};
    }
    if (getDifficultyMultiplier().isHard) return {id:'reward_risk', title:'1,000미소 이상 · 극한 도전', desc:'이번 구간을 통과하면 오늘 보상이 1,000미소 이상이 되어 매우 어려워요. 패배하면 금고를 잃어요. 지금 안전하게 수령할 수 있어요.', action:'안전하게 수령', tab:'battle', target:'cashout', focus:'btn-cashout'};
    if (getChallengePot() > 0 && !hasCashedOut) return {id:'first_cashout', title:'4 / 5 · 금고 수령', desc:'금고에 포인트가 쌓였어요! 멈추고 수령하면 이번 도전이 끝나고 선생님께 청구할 미소가 돼요.', action:'수령 방법 보기', tab:'battle', target:'cashout', focus:'btn-cashout'};
    if (typeof Battle !== 'undefined' && Battle.ult >= 100) return {id:'ult', title:'별자리 합주 준비!', desc:'게이지가 가득 찼어요. 별자리 합주로 적을 공격하고 동행을 회복하세요.', action:'별자리 합주', tab:'battle', target:'ult', focus:'ult-btn'};
    return {id:'progress', title:'동행이 자동으로 싸우고 있어요', desc:'스테이지를 밝히면 금고 포인트가 쌓여요. 원하는 순간 멈추고 수령하세요. 성장 미소로 영웅도 키울 수 있어요.', action:'전투 보기', tab:'battle', target:'battle'};
  }

  function reloadFromAuth() {
    if (typeof Battle !== 'undefined') Battle.stop();
    staleTab = false;
    state = load(); partyPower();
    pendingOffline = computeOffline();
    Battle.syncParty({full: true});
    if (state.run && state.run.status === 'active') Battle.start();
    if (window.UI) { UI.refreshAll(); UI.updateKeeperHUD(); }
    showArrival();
    if (typeof Rewards !== 'undefined') Rewards.sync();
  }

  function logout() {
    save();
    if (typeof Battle !== 'undefined') Battle.pause();
    if (typeof Auth !== 'undefined') Auth.logout();
    if (window.UI) {
      UI.closeModal();
      UI.updateKeeperHUD();
      UI.openKeeperGate();
    }
  }

  function getKeeperName() {
    if (typeof Auth !== 'undefined') {
      const u = Auth.getCurrentUser();
      if (u) return u;
    }
    return '별의 파수꾼';
  }

  const api = {
    get state() { return state; },
    currentStage: currentStage,
    goldRate: goldRate,
    growthStatus: growthStatus,
    acknowledgeBalanceAdjustment: acknowledgeBalanceAdjustment,
    partyPower: partyPower,
    getPartyCombat: getPartyCombat,
    heroInfo: heroInfo,
    canLevelAny: canLevelAny,
    levelHero: levelHero,
    levelPartyBulk: levelPartyBulk,
    ascendHero: ascendHero,
    setPartySlot: setPartySlot,
    summon: summon,
    stageCleared: stageCleared,
    rewardKill: rewardKill,
    onBossKill: onBossKill,
    achievementState: achievementState,
    hasClaimableAchievement: hasClaimableAchievement,
    claimAchievement: claimAchievement,
    startJourney: startJourney,
    claimOffline: claimOffline,
    setSfx: setSfx,
    getGuideStep: getGuideStep,
    teacherLog: teacherLog,
    recordCertificateCopy: recordCertificateCopy,
    recordClassTalkSubmission: recordClassTalkSubmission,
    today: getTodayStr,
    startChallenge: startChallenge,
    reset: reset,
    save: save,
    reloadFromAuth: reloadFromAuth,
    logout: logout,
    getKeeperName: getKeeperName,
    checkDailyPlays: checkDailyPlays,
    getChallengePot: getChallengePot,
    getDailyRewardClaimed: getDailyRewardClaimed,
    getDifficultyMultiplier: getDifficultyMultiplier,
    cashoutChallengePot: cashoutChallengePot,
    failChallengePot: failChallengePot
  };

  function boot() {
    state = load();
    window.Game = api;

    SFX.setEnabled(state.sfx);

    UI.init();
    Battle.init(
      document.getElementById('battle-canvas'),
      document.getElementById('battle-wrap')
    );
    Battle.syncParty({ full: true });

    const currentUser = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;

    if (!currentUser) {
      // Prompt Name & Password Gate for authentication
      UI.openKeeperGate();
    } else {
      if (state.run && state.run.status === 'active') Battle.start();
      pendingOffline = computeOffline();
      showArrival();
    }

    window.addEventListener('storage', function (e) {
      if (e.key === getActiveSaveKey() && e.newValue && !staleTab && e.newValue !== loadedSave) {
        Battle.stop(); state = load(); staleTab = true; UI.refreshAll();
        UI.openSyncNotice();
      }
    });
    bindPersistence();
    startIdle();
    if (typeof Rewards !== 'undefined') Rewards.start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return api;
})();

window.Game = Game;
