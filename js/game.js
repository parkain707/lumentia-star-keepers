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

  function num(value, fallback) {
    const n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  /* ---------------- state ---------------- */

  function getTodayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function freshState() {
    const heroes = {};
    DEFAULT_PARTY.forEach(function (id) {
      heroes[id] = { lv: 1, star: 1, shards: 0 };
    });
    return {
      v: 1,
      gold: START_GOLD,
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
      challengePot: 0,
      challengeStreak: 0,
      dailyPlays: { date: getTodayStr(), count: 0 },
      dailyEarned: { date: getTodayStr(), amount: 0 },
      runActive: false,
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
    s.challengePot = Math.min(BALANCE.maxPot, Math.max(0, Math.floor(num(data.challengePot, 0))));
    s.challengeStreak = Math.max(0, Math.floor(num(data.challengeStreak, 0)));
    const today = getTodayStr();
    if (data.dailyPlays && typeof data.dailyPlays === 'object' && data.dailyPlays.date === today) {
      s.dailyPlays = { date: today, count: Math.max(0, Math.min(BALANCE.dailyAttempts, Math.floor(num(data.dailyPlays.count, 0)))) };
    } else {
      s.dailyPlays = { date: today, count: 0 };
    }
    if (data.dailyEarned && typeof data.dailyEarned === 'object' && data.dailyEarned.date === today) {
      s.dailyEarned = {
        date: today,
        amount: Math.max(0, Math.min(BALANCE.dailyCap, Math.floor(num(data.dailyEarned.amount, 0))))
      };
    } else {
      s.dailyEarned = { date: today, amount: 0 };
    }
    const sameDay = !!(data.dailyPlays && data.dailyPlays.date === today);
    s.runActive = data.runActive === true && sameDay && s.tutorial;
    s.challengePot = Math.min(s.challengePot, Math.max(0, BALANCE.dailyCap - s.dailyEarned.amount));
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

    return s;
  }

  function save() {
    if (!state || resetting) return;
    state.lastSeen = Date.now();
    const key = getActiveSaveKey();
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) { /* storage may be unavailable */ }
  }

  /* ---------------- economy ---------------- */

  function goldRate(n) {
    n = Math.max(0, Math.floor(num(n, 0)));
    return BALANCE.goldPerSec * Math.pow(BALANCE.goldPerSecGrowth, n);
  }

  function currentStage() {
    return state ? state.highest + 1 : 1;
  }

  function smileCap(raw) {
    return Math.max(0, Math.min(BALANCE.maxReward, Math.round(num(raw, 0))));
  }

  function ensureDaily() {
    if (!state) return;
    const today = getTodayStr();
    if (!state.dailyPlays || state.dailyPlays.date !== today) {
      state.dailyPlays = { date: today, count: 0 };
      state.runActive = false;
    }
    if (!state.dailyEarned || state.dailyEarned.date !== today) {
      state.dailyEarned = { date: today, amount: 0 };
    }
    if (state.dailyEarned.amount > BALANCE.dailyCap) state.dailyEarned.amount = BALANCE.dailyCap;
    if ((state.challengePot || 0) > BALANCE.maxPot) state.challengePot = BALANCE.maxPot;
  }

  function budgetLeft() {
    if (!state) return 0;
    ensureDaily();
    return Math.max(0, BALANCE.dailyCap - state.dailyEarned.amount);
  }

  // 모든 미소 지급은 이 창구를 지납니다. 하루 5,000미소를 넘길 수 없습니다.
  function grantSmile(amount, label, opts) {
    opts = opts || {};
    if (!state) return 0;
    ensureDaily();
    const want = smileCap(amount);
    const value = Math.min(want, budgetLeft());
    if (value <= 0) {
      if (!opts.silent && window.UI) {
        UI.toast('오늘의 미소 한도(' + fmt(BALANCE.dailyCap) + ')를 모두 받았어요 · 내일 다시 만나요', 'bad');
      }
      return 0;
    }
    state.gold += value;
    state.stats.totalGold += value;
    state.dailyEarned.amount += value;
    if (!opts.silent) reportSmile(value, label || '미소 보상');
    if (window.UI && UI.updateDaily) UI.updateDaily();
    return value;
  }

  function depositPot(amount) {
    if (!state) return 0;
    ensureDaily();
    const room = Math.max(0, Math.min(BALANCE.maxPot, BALANCE.dailyCap - state.dailyEarned.amount) - (state.challengePot || 0));
    const added = Math.min(room, smileCap(amount));
    if (added > 0) state.challengePot = (state.challengePot || 0) + added;
    return added;
  }

  function reportSmile(amount, label) {
    if (!state) return;
    const value = smileCap(amount);
    if (value <= 0) return;
    state.reports.push({ t: Date.now(), amount: value, label: label || '미소 보상' });
    if (state.reports.length > 60) state.reports.splice(0, state.reports.length - 60);
    if (window.UI && UI.showTeacherReport) UI.showTeacherReport(value, label || '미소 보상');
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
    if (!state) return 0;
    const gold = BALANCE.killGold *
      Math.pow(BALANCE.goldGrowth, Math.max(0, stage - 1)) *
      (isBoss ? BALANCE.bossGoldMult : 1);
    return depositPot(gold);
  }

  function onBossKill() {
    if (!state) return;
    state.stats.bossKills += 1;
    if (window.UI) UI.renderHUD();
  }

  function stageCleared(stage, boss) {
    if (!state) return { gold: 0, gems: 0 };
    const first = stage > state.highest;
    let gold = Math.round(BALANCE.killGold * 1.5 * Math.pow(BALANCE.goldGrowth, Math.max(0, stage - 1)));
    let gems = 0;
    let shards = null;

    if (first) {
      state.highest = stage;
      gems = boss ? 45 : 15;
      state.gems += gems;
      gold += Math.round(20 * Math.pow(BALANCE.goldGrowth, Math.max(0, stage - 1)));

      if (stage % 10 === 0) {
        const pool = state.owned.filter(function (id) {
          return state.heroes[id] && state.heroes[id].star < BALANCE.maxStar;
        });
        const target = pool.length
          ? pool[Math.floor(Math.random() * pool.length)]
          : state.owned[0];
        if (target && state.heroes[target]) {
          const amount = 10 + Math.floor(stage / 10) * 2;
          state.heroes[target].shards += amount;
          shards = { name: HERO_BY_ID[target].name + ' 조각', amount: amount };
        }
      }
    }

    // Accumulate into Challenge Pot (daily cap applies to every smile).
    const potBefore = state.challengePot || 0;
    const addedPot = depositPot(gold);
    state.challengeStreak = (state.challengeStreak || 0) + 1;
    partyPower();
    save();

    if (window.UI) {
      UI.renderHUD();
      UI.renderChallengePot();
      const missions = document.getElementById('screen-missions');
      if (missions && missions.classList.contains('active')) UI.renderMissions();
    }

    return {
      gold: addedPot,
      pot: state.challengePot,
      potBefore: potBefore,
      gems: gems,
      shards: shards,
      isHard: state.challengePot >= BALANCE.hardPot,
      capReached: state.challengePot >= BALANCE.maxPot
    };
  }

  function checkDailyPlays() {
    const max = BALANCE.dailyAttempts;
    if (!state) return { available: 0, max: max, canPlay: false, used: max };
    const today = getTodayStr();
    if (!state.dailyPlays || state.dailyPlays.date !== today) {
      state.dailyPlays = { date: today, count: 0 };
      state.runActive = false;
    }
    const used = Math.min(max, state.dailyPlays.count || 0);
    const available = Math.max(0, max - used);
    return {
      available: available,
      used: used,
      max: max,
      canPlay: available > 0
    };
  }

  function consumeDailyPlay() {
    if (!state) return false;
    const status = checkDailyPlays();
    if (!status.canPlay) return false;
    state.dailyPlays.count = (state.dailyPlays.count || 0) + 1;
    save();
    if (window.UI) UI.updateDailyBadge();
    return true;
  }

  function beginRun() {
    if (!state) return false;
    ensureDaily();
    if (state.runActive) return true;
    if (!checkDailyPlays().canPlay) return false;
    consumeDailyPlay();
    state.runActive = true;
    save();
    if (window.UI) UI.updateRunState();
    return true;
  }

  function endRun() {
    if (!state || !state.runActive) return;
    state.runActive = false;
    save();
    if (window.UI) UI.updateRunState();
  }

  function dailyInfo() {
    const info = {
      cap: BALANCE.dailyCap,
      earned: 0,
      remaining: BALANCE.dailyCap,
      attemptsLeft: 0,
      used: BALANCE.dailyAttempts,
      max: BALANCE.dailyAttempts,
      canPlay: false,
      pot: 0,
      runActive: false
    };
    if (!state) return info;
    ensureDaily();
    const d = checkDailyPlays();
    info.earned = state.dailyEarned.amount;
    info.remaining = Math.max(0, BALANCE.dailyCap - info.earned);
    info.attemptsLeft = d.available;
    info.used = d.used;
    info.canPlay = d.canPlay;
    info.pot = state.challengePot || 0;
    info.runActive = !!state.runActive;
    return info;
  }

  function getChallengePot() {
    return state ? (state.challengePot || 0) : 0;
  }

  function getDifficultyMultiplier() {
    if (!state) return { hpMult: 1, atkMult: 1, isHard: false, pot: 0 };
    const pot = state.challengePot || 0;
    if (pot < BALANCE.hardPot) {
      return { hpMult: 1.0, atkMult: 1.0, isHard: false, pot: pot };
    }
    // 1,000 미소부터 곧바로 매우 어려워지고, 금고가 찰수록 더 강해집니다.
    const ramp = (pot - BALANCE.hardPot) / 1000;
    return {
      hpMult: Math.min(10, 2.4 + ramp * 1.2),
      atkMult: Math.min(6, 1.9 + ramp * 0.6),
      isHard: true,
      pot: pot
    };
  }

  function cashoutChallengePot() {
    if (!state || (state.challengePot || 0) <= 0) return { ok: false, amount: 0 };
    ensureDaily();
    const pot = state.challengePot || 0;
    const amount = Math.min(pot, budgetLeft());
    if (amount <= 0) {
      if (window.UI) {
        UI.toast('오늘의 미소 한도(' + fmt(BALANCE.dailyCap) + ')를 모두 받았어요 · 내일 다시 만나요', 'bad');
      }
      return { ok: false, amount: 0, reason: 'daily-cap' };
    }
    state.challengePot = pot - amount;
    state.challengeStreak = 0;
    state.gold += amount;
    state.stats.totalGold += amount;
    state.dailyEarned.amount += amount;
    state.runActive = false;
    partyPower();
    save();
    reportSmile(amount, '도전 수령');
    if (typeof Battle !== 'undefined') Battle.pause();
    if (window.UI) {
      UI.renderHUD();
      UI.renderChallengePot();
      UI.updateRunState();
      UI.openTeacherCertificate(amount);
    }
    return { ok: true, amount: amount, remainder: state.challengePot };
  }

  function failChallengePot() {
    if (!state) return { lost: 0 };
    const lost = state.challengePot || 0;
    state.challengePot = 0;
    state.challengeStreak = 0;
    save();
    if (window.UI) {
      UI.renderChallengePot();
    }
    return { lost: lost };
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

    state.achievements[id] = true;
    if (a.reward.gems) state.gems += a.reward.gems;
    let smile = 0;
    if (a.reward.gold) {
      smile = grantSmile(a.reward.gold, '임무 보상');
    }
    save();
    return { ok: true, label: a.title, reward: a.reward, gold: smile };
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

    state.pending = pending || null;
    state.lastSeen = Date.now();
    save();
    return state.pending;
  }

  function claimOffline(info) {
    if (!state) return 0;
    const pending = state.pending || info;
    if (!pending) return 0;
    const gold = grantSmile(pending.gold, '휴식 보상');
    const leftover = Math.max(0, pending.gold - gold);
    state.pending = leftover > 0 ? { gold: leftover, seconds: pending.seconds || 0 } : null;
    pendingOffline = null;
    partyPower();
    save();
    if (window.UI) UI.renderHUD();
    return gold;
  }

  function startJourney() {
    if (!state) return;
    state.tutorial = true;
    save();
    Battle.start();
    if (window.UI) UI.refreshAll();
    if (!offlineShown && pendingOffline) {
      offlineShown = true;
      setTimeout(function () {
        if (window.UI) UI.openOffline(pendingOffline);
      }, 400);
    }
  }

  function setSfx(on) {
    if (!state) return;
    state.sfx = !!on;
    SFX.setEnabled(state.sfx);
    save();
  }

  function reset() {
    resetting = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    window.location.reload();
  }

  /* ---------------- loop / boot ---------------- */

  function startIdle() {
    lastTick = performance.now();
    setInterval(function () {
      if (!state || !state.tutorial) return;
      const now = performance.now();
      let dt = (now - lastTick) / 1000;
      lastTick = now;
      if (dt <= 0) return;
      if (dt > 5) dt = 5;
      // 도전 중에만 미소가 금고에 쌓입니다. 받은 미소는 [멈추고 수령]으로 정산합니다.
      if (state.runActive) depositPot(goldRate(state.highest) * BALANCE.potIdleRate * dt);
      if (window.UI && document.visibilityState !== 'hidden') UI.renderHUD();
    }, 500);
  }

  function bindPersistence() {
    setInterval(save, 5000);
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
    const info = dailyInfo();

    // 0. 도전 시작 / 금고 수령
    if (!state.runActive) {
      if ((state.challengePot || 0) > 0) {
        return {
          id: 'cashout',
          title: '금고 수령',
          desc: '금고에 ' + fmt(state.challengePot) + ' 미소가 있어요! [멈추고 수령]을 눌러 미소를 받고 선생님께 알려주세요.',
          tab: 'battle',
          target: 'cashout'
        };
      }
      return {
        id: 'start_run',
        title: info.canPlay ? '오늘의 도전' : '오늘 도전 완료',
        desc: info.canPlay
          ? '오늘 ' + info.attemptsLeft + '회 도전할 수 있어요. [도전 시작]을 눌러 별길을 걷고 미소를 모으세요!'
          : '오늘 도전 2회를 모두 마쳤습니다. 내일 다시 만나요!',
        tab: 'battle',
        target: 'start'
      };
    }
    if ((state.challengePot || 0) >= BALANCE.hardPot) {
      return {
        id: 'cashout_danger',
        title: '금고가 위험해요',
        desc: '금고 ' + fmt(state.challengePot) + ' 미소 · 1,000미소부터 적이 매우 강해집니다! 지금 [멈추고 수령]으로 안전하게 받으세요.',
        tab: 'battle',
        target: 'cashout'
      };
    }

    // 1. 궁극기 준비
    if (window.Battle && Battle.ult >= 100) {
      return {
        id: 'ult',
        title: '궁극기 충전!',
        desc: '별자리 합주 게이지 100%! 오른쪽 아래 [별자리 합주] 버튼을 눌러 강력한 별빛을 폭발시키세요!',
        tab: 'battle',
        target: 'ult'
      };
    }
    // 2. 무료 10연 소환 대기
    if (state.freeTen) {
      return {
        id: 'summon_free',
        title: '무료 10회 소환',
        desc: '첫 10회 소환은 무료입니다! 하단 [소환] 탭을 눌러 별의 인도자들을 맞이하세요!',
        tab: 'summon',
        target: 'summon'
      };
    }
    // 3. 획득한 새 영웅 파티 미배치
    if (state.party.length < 3 && state.owned.length > state.party.length) {
      return {
        id: 'party_slot',
        title: '동행 편성',
        desc: '새로운 동행이 대기 중입니다! [영웅] 탭에서 빈 파티 슬롯을 눌러 함께 출격하세요!',
        tab: 'heroes',
        target: 'heroes'
      };
    }
    // 4. 레벨업 가능
    if (state.gold >= 300 && canLevelAny()) {
      const minLv = state.party.reduce(function (min, id) {
        const h = state.heroes[id];
        return h ? Math.min(min, h.lv) : min;
      }, 999);
      if (minLv < 30) {
        return {
          id: 'level_hero',
          title: '동행 성장',
          desc: '미소가 넉넉합니다! [영웅] 탭에서 동행들을 레벨업하여 전투력을 강화하세요!',
          tab: 'heroes',
          target: 'heroes'
        };
      }
    }
    // 5. 달성된 임무 보상 수령
    if (hasClaimableAchievement()) {
      return {
        id: 'mission_reward',
        title: '임무 달성',
        desc: '달성한 임무가 있습니다! [임무] 탭에서 소중한 별빛 보상을 수령하세요!',
        tab: 'missions',
        target: 'missions'
      };
    }
    // 6. 가챠 10연차 가능 (별빛 2500 이상)
    if (state.gems >= 2500) {
      return {
        id: 'summon_gems',
        title: '별빛 소환',
        desc: '별빛이 가득합니다! [소환] 탭에서 10연차 소환으로 새 동행과 성혼을 모으세요!',
        tab: 'summon',
        target: 'summon'
      };
    }
    // 7. 일반 진행
    return {
      id: 'progress',
      title: '성운 탐험',
      desc: '동행들이 스스로 안개를 걷어내며 전진합니다. 전투를 지켜보며 미소를 수집하세요!',
      tab: 'battle',
      target: 'battle'
    };
  }

  function reloadFromAuth() {
    state = load();
    partyPower();
    if (typeof Battle !== 'undefined') {
      Battle.syncParty();
      if (state.tutorial && state.runActive) Battle.start();
    }
    if (window.UI) {
      UI.refreshAll();
      UI.updateKeeperHUD();
    }
    pendingOffline = computeOffline();
    if (!state.tutorial) {
      UI.openWelcome();
    } else if (pendingOffline) {
      setTimeout(function () { UI.openOffline(pendingOffline); }, 350);
    }
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
    teacherLog: function () { return state ? state.reports.slice() : []; },
    reset: reset,
    save: save,
    reloadFromAuth: reloadFromAuth,
    logout: logout,
    getKeeperName: getKeeperName,
    checkDailyPlays: checkDailyPlays,
    consumeDailyPlay: consumeDailyPlay,
    beginRun: beginRun,
    endRun: endRun,
    dailyInfo: dailyInfo,
    budgetLeft: budgetLeft,
    getChallengePot: getChallengePot,
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

    const currentUser = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null;

    if (!currentUser) {
      // Prompt Name & Password Gate for authentication
      UI.openKeeperGate();
    } else {
      pendingOffline = computeOffline();
      // 진행 중이던 도전만 이어서 달립니다. 새 도전은 [도전 시작]으로만 시작합니다.
      if (state.tutorial && state.runActive) Battle.start();
      if (!state.tutorial) {
        UI.openWelcome();
      } else if (pendingOffline) {
        offlineShown = true;
        setTimeout(function () { UI.openOffline(pendingOffline); }, 450);
      }
    }

    bindPersistence();
    startIdle();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  return api;
})();

window.Game = Game;
