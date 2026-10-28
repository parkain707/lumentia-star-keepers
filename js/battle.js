'use strict';

/* =========================================================
   BATTLE — auto combat simulation + canvas presentation
   ========================================================= */
const Battle = (function () {
  const W = 800;
  const H = 1000;
  const TAU = Math.PI * 2;

  const HERO_SPOTS = [
    { x: 230, y: 795, s: 1.45 },
    { x: 330, y: 805, s: 1.35 },
    { x: 420, y: 790, s: 1.50 }
  ];
  const ENEMY_SPOTS = [
    { x: 505, y: 835, s: 1.25 },
    { x: 595, y: 800, s: 1.38 },
    { x: 670, y: 838, s: 1.20 }
  ];
  const BOSS_SPOT = { x: 590, y: 795, s: 1.70 };
  const BOSS_ADD_SPOTS = [
    { x: 470, y: 840, s: 1.10 },
    { x: 675, y: 825, s: 1.05 }
  ];

  const FONT = '"Pretendard", "Malgun Gothic", "맑은 고딕", sans-serif';

  let canvas = null;
  let ctx = null;
  let wrap = null;
  let cw = 0;
  let ch = 0;
  let raf = 0;
  let running = false;
  let started = false;
  let lastTs = 0;
  let time = 0;
  let backdrop = null;

  let heroes = [];
  let enemies = [];
  let projectiles = [];
  let particles = [];
  let floaters = [];
  let slashes = [];
  let rings = [];

  let stage = 1;
  let phase = 'ready';
  let phaseT = 0;
  let elapsed = 0;
  let clearStarted = false;
  let ult = 0;
  let ultReady = false;
  let shake = 0;
  let flash = 0;
  let ultFx = 0;
  let camPulse = 0;
  let clearFx = 0;
  let uiT = 0;
  let uid = 0;

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function aliveEnemies() {
    return enemies.filter(function (e) { return !e.dead; });
  }

  function aliveHeroes() {
    return heroes.filter(function (h) { return !h.dead; });
  }

  function atkOf(u) {
    let mul = 1;
    (u.buffs || []).forEach(function (b) {
      if (b.until > time && b.stat === 'atk') mul += b.value;
    });
    return u.stats.atk * mul;
  }

  /* ---------------- party sync ---------------- */

  function syncParty(opts) {
    opts = opts || {};
    if (!window.Game || !Game.state) return;
    const data = Game.getPartyCombat();
    const prev = {};
    heroes.forEach(function (h) { prev[h.id] = h; });

    heroes = data.map(function (d, i) {
      const spot = HERO_SPOTS[i] || HERO_SPOTS[0];
      const old = prev[d.id];
      const maxHp = Math.max(1, Math.round(d.stats.hp));
      let hp;
      if (opts.full) hp = maxHp;
      else if (old) hp = Math.min(maxHp, Math.max(0, Math.round((old.hp / old.maxHp) * maxHp)));
      else hp = maxHp;

      const u = old || {
        id: d.id,
        shield: 0,
        buffs: [],
        atkTimer: 0.25 + i * 0.2,
        skillTimer: (d.hero.skill.cd || 8) * 0.55 + i * 0.45,
        flash: 0,
        lunge: 0,
        dead: false,
        deadT: 0
      };
      u.hero = d.hero;
      u.name = d.hero.name;
      u.cls = d.hero.cls;
      u.seed = d.hero.seed;
      u.stats = d.stats;
      u.maxHp = maxHp;
      u.hp = hp;
      u.dead = hp <= 0;
      if (!u.dead) u.deadT = 0;
      u.x = spot.x;
      u.y = spot.y;
      u.scale = spot.s;
      return u;
    });

    updatePartyUI(true);
  }

  /* ---------------- stage lifecycle ---------------- */

  function makeEnemy(cfg) {
    const maxHp = Math.max(1, Math.round(cfg.hp));
    return {
      id: 'e' + (++uid),
      name: cfg.name,
      shape: cfg.shape,
      color: cfg.color,
      isBoss: !!cfg.isBoss,
      x: cfg.x,
      y: cfg.y,
      scale: cfg.s,
      maxHp: maxHp,
      hp: maxHp,
      atk: cfg.atk,
      def: cfg.def,
      interval: cfg.interval,
      atkTimer: rnd(0.4, 1.2),
      flash: 0,
      lunge: 0,
      dead: false,
      deadT: 0,
      seed: rnd(0, 6)
    };
  }

  function spawnEnemies(n) {
    enemies = [];
    const diff = (typeof Game !== 'undefined') ? Game.getDifficultyMultiplier() : { hpMult: 1, atkMult: 1, isHard: false, pot: 0 };
    const hpBase = Math.max(BALANCE.enemyHp * Math.pow(BALANCE.enemyHpGrowth, n - 1) * diff.hpMult, diff.enemyHpFloor || 0);
    const atkBase = Math.max(BALANCE.enemyAtk * Math.pow(BALANCE.enemyAtkGrowth, n - 1) * diff.atkMult, diff.enemyAtkFloor || 0);
    const defBase = BALANCE.enemyDef + (n - 1) * BALANCE.enemyDefGrowth;
    const hard = Math.max(0, n - BALANCE.hardStage + 1);
    const hardHp = Math.pow(BALANCE.hardHpGrowth, hard);
    const hardAtk = Math.pow(BALANCE.hardAtkGrowth, hard);
    const hardBoss = Math.pow(BALANCE.hardBossGrowth, hard);

    if (isBossStage(n)) {
      enemies.push(makeEnemy({
        name: bossNameOf(n),
        shape: 'boss',
        color: '#ffc9d8',
        isBoss: true,
        x: BOSS_SPOT.x,
        y: BOSS_SPOT.y,
        s: BOSS_SPOT.s,
        hp: hpBase * BALANCE.bossHpMult * hardBoss,
        atk: atkBase * BALANCE.bossAtkMult * hardAtk,
        def: defBase * 1.15,
        interval: BALANCE.bossInterval
      }));
      BOSS_ADD_SPOTS.forEach(function (spot, i) {
        const t = ENEMY_TYPES[(n + i) % ENEMY_TYPES.length];
        enemies.push(makeEnemy({
          name: t.name,
          shape: t.shape,
          color: t.color,
          x: spot.x,
          y: spot.y,
          s: spot.s,
          hp: hpBase * 0.55 * t.hp * hardHp,
          atk: atkBase * 0.8 * t.atk * hardAtk,
          def: defBase * 0.85,
          interval: BALANCE.enemyInterval
        }));
      });
    } else {
      ENEMY_SPOTS.forEach(function (spot, i) {
        const t = ENEMY_TYPES[(n + i) % ENEMY_TYPES.length];
        enemies.push(makeEnemy({
          name: t.name,
          shape: t.shape,
          color: t.color,
          x: spot.x,
          y: spot.y,
          s: spot.s,
          hp: hpBase * t.hp * hardHp,
          atk: atkBase * t.atk * hardAtk,
          def: defBase,
          interval: BALANCE.enemyInterval
        }));
      });
    }
  }

  function beginStage(n, opts) {
    opts = opts || {};
    stage = n;
    if (Game.state.run) Game.state.run.stage = n;
    phase = 'fight';
    phaseT = 0;
    elapsed = 0;
    clearStarted = false;
    projectiles = [];
    particles = [];
    floaters = [];
    slashes = [];
    rings = [];
    spawnEnemies(n);
    if (Game.getDifficultyMultiplier().isHard) UI.toast('고위험 도전 · 오늘 보상 5,000미소 초과 구간은 매우 어렵습니다. 금고를 잃기 전에 수령할 수 있어요.', 'bad');
    if (opts.full) syncParty({ full: true });

    UI.setStage(n, isBossStage(n), Game.state.highest);
    if (n === BALANCE.hardStage) {
      UI.toast('깊은 안개 구간 · 난도가 크게 오릅니다', 'bad');
    }
    if (isBossStage(n)) {
      camPulse = Math.max(camPulse, 0.05);
      SFX.play('boss');
      if (!opts.retry) UI.showBanner('성좌의 문', bossNameOf(n), '');
    } else if (opts.retry) {
      UI.showBanner('다시 걷기', '동행들이 다시 별빛을 모읍니다', '');
    }
    updatePartyUI(true);
  }

  function nextStage() {
    beginStage(stage + 1, {});
  }

  function onStageClear() {
    if (phase !== 'fight' || clearStarted) return;
    clearStarted = true;
    phase = 'clear';
    phaseT = 2.4;

    const boss = isBossStage(stage);
    const reward = Game.stageCleared(stage, boss);
    if (!Game.state.run || Game.state.run.status !== 'active') return;

    heroes.forEach(function (h) {
      if (h.dead) {
        h.dead = false;
        h.deadT = 0;
        h.hp = Math.round(h.maxHp * 0.45);
      } else {
        h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.35);
      }
      h.shield = 0;
      h.buffs = [];
    });

    let sub = '성장 미소 +' + fmt(reward.gold) + ' · 금고 +' + fmt(reward.points) + 'P';
    if (reward.gems) sub += ' · 별빛 +' + fmt(reward.gems);
    if (reward.shards) sub += ' · ' + reward.shards.name + ' +' + reward.shards.amount;
    UI.showBanner('별길 ' + stage + ' 밝힘', sub);
    SFX.play('victory');
    camPulse = Math.max(camPulse, 0.045);
    clearFx = 1;
    ult = Math.min(100, ult + 6);
    updatePartyUI(true);

    Game.save();
  }

  function startDefeat(timeout) {
    if (phase !== 'fight' || !started) return;
    SFX.play('defeat');
    Game.failChallengePot();
  }

  /* ---------------- combat ---------------- */

  function addUlt(n) {
    if (phase !== 'fight') return;
    const before = ult;
    ult = Math.min(100, ult + n);
    if (before < 100 && ult >= 100) {
      ultReady = true;
      SFX.play('claim');
      UI.toast('별자리 합주가 준비되었습니다', 'gold');
    }
  }

  function addFloater(x, y, text, color, size, crit, life) {
    floaters.push({
      x: x,
      y: y,
      text: text,
      color: color || '#fff',
      size: size || 24,
      crit: !!crit,
      t: 0,
      life: life || (crit ? 1.0 : 0.82)
    });
  }

  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = rnd(35, 190);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        grav: 160,
        size: rnd(1.2, 3.8),
        color: color,
        t: 0,
        life: rnd(0.35, 0.8)
      });
    }
  }

  function addSlash(x, y, color) {
    slashes.push({
      x: x,
      y: y,
      angle: rnd(-0.7, 0.7),
      color: color,
      t: 0,
      life: 0.32
    });
  }

  function addRing(x, y, r0, r1, color, life) {
    rings.push({ x: x, y: y, r0: r0, r1: r1, color: color, t: 0, life: life || 0.6 });
  }

  function healHero(h, amount) {
    if (!h || h.dead) return;
    const before = h.hp;
    h.hp = Math.min(h.maxHp, h.hp + amount);
    const gained = Math.round(h.hp - before);
    if (gained > 0) {
      addFloater(h.x + rnd(-10, 10), h.y - 130 * h.scale, '+' + fmt(gained), '#7ef0c0', 22);
      for (let i = 0; i < 5; i++) {
        particles.push({
          x: h.x + rnd(-30, 30),
          y: h.y - rnd(20, 120),
          vx: rnd(-12, 12),
          vy: rnd(-90, -40),
          grav: 0,
          size: rnd(1, 2.6),
          color: '#7ef0c0',
          t: 0,
          life: rnd(0.5, 0.9)
        });
      }
    }
  }

  function hitEnemy(e, raw, opts) {
    if (!e || e.dead) return;
    opts = opts || {};
    const crit = !!opts.crit;
    let dmg = raw * (100 / (100 + e.def));
    if (crit) dmg *= 1.65;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.flash = 0.55;
    addFloater(
      e.x + rnd(-14, 14),
      e.y - 55 * e.scale - 20,
      '✦' + dmg,
      crit ? '#ffd479' : '#f2f7ff',
      crit ? 34 : 23,
      crit
    );
    burst(e.x, e.y, crit ? '#ffd479' : e.color, crit ? 10 : 5);
    if (crit) {
      shake = Math.max(shake, 3);
      SFX.play('crit');
    } else {
      SFX.play('hit');
    }
    addUlt(1.1);

    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.hp = 0;
    e.dead = true;
    e.deadT = 0;
    burst(e.x, e.y, e.color, 16);
    burst(e.x, e.y, '#ffd479', 8);
    const gold = Game.rewardKill(stage, e.isBoss);
    addFloater(e.x, e.y - 55, '+' + fmt(gold), '#ffd479', 19);
    addUlt(2.2);
    if (e.isBoss) {
      shake = 5;
      camPulse = Math.max(camPulse, 0.035);
      addRing(e.x, e.y, 20, 160, '#ffd479', 0.8);
      SFX.play('coin');
      Game.onBossKill();
    }
  }

  function hitHero(h, raw) {
    if (!h || h.dead) return;
    let dmg = Math.max(1, Math.round(raw * (100 / (100 + h.stats.def))));
    let absorbed = 0;
    if (h.shield > 0) {
      absorbed = Math.min(h.shield, dmg);
      h.shield -= absorbed;
      dmg -= absorbed;
    }
    if (absorbed > 0) {
      addFloater(h.x - 16, h.y - 120 * h.scale, '울타리', '#78e3ff', 17);
    }
    if (dmg > 0) {
      h.hp -= dmg;
      addFloater(h.x + rnd(-10, 10), h.y - 135 * h.scale, '기운 -' + fmt(dmg), '#a8c4ff', 19);
    }
    h.flash = 0.6;
    shake = Math.max(shake, 1.5);
    SFX.play('hit');
    addUlt(0.9);

    if (h.hp <= 0) {
      h.hp = 0;
      h.dead = true;
      h.deadT = 0;
      h.shield = 0;
      addFloater(h.x, h.y - 150 * h.scale, '잠시 쉼', '#a8c4ff', 19);
      burst(h.x, h.y - 40, '#a8c4ff', 12);
    }
  }

  function spawnProjectile(from, target, raw, crit, opts) {
    opts = opts || {};
    if (!target) return;
    const isHero = opts.source !== 'enemy';
    projectiles.push({
      x: from.x + (isHero ? 22 : -22),
      y: from.y - (isHero ? 92 : 0) * (from.scale || 1),
      tx: target.x,
      ty: target.y - (isHero ? 20 : 70) * (target.scale || 1),
      t: 0,
      dur: opts.type === 'comet' ? 0.34 : rnd(0.2, 0.28),
      raw: raw,
      crit: !!crit,
      color: opts.color || '#fff',
      type: opts.type || 'bolt',
      target: target,
      source: opts.source || 'hero'
    });
  }

  function heroAttack(u) {
    const targets = aliveEnemies();
    if (!targets.length) return;
    const target = pick(targets);
    u.lunge = 1;
    const crit = Math.random() < (0.06 + (u.stats.crit || 0));
    const raw = atkOf(u) * rnd(0.92, 1.08);
    const color = u.hero.palette.ring;

    if (u.cls === 'mage' || u.cls === 'song') {
      spawnProjectile(u, target, raw, crit, { color: color, type: u.cls === 'mage' ? 'bolt' : 'note' });
    } else {
      hitEnemy(target, raw, { crit: crit });
      addSlash(target.x, target.y - 35, color);
    }
    addUlt(1.2);
  }

  function castSkill(u) {
    if (u.dead) return;
    const sk = u.hero.skill;
    addFloater(u.x, u.y - 185 * u.scale, sk.name, u.hero.palette.ring, 17, false, 1.1);
    addRing(u.x, u.y - 40, 10, 70, u.hero.palette.ring, 0.5);

    if (sk.type === 'damage') {
      const targets = aliveEnemies();
      if (!targets.length) return;
      let chosen;
      if (sk.targets === 'all') chosen = targets.slice();
      else if (sk.targets === 1) {
        chosen = [targets.slice().sort(function (a, b) { return b.maxHp - a.maxHp; })[0]];
      } else {
        chosen = shuffle(targets).slice(0, sk.targets);
      }
      chosen.forEach(function (t) {
        if (!t) return;
        const crit = Math.random() < 0.14;
        const raw = atkOf(u) * sk.mult;
        if (sk.effect === 'comet') {
          spawnProjectile(u, t, raw, crit, { color: u.hero.palette.core, type: 'comet' });
        } else {
          hitEnemy(t, raw, { crit: crit });
          if (sk.effect === 'arc') addSlash(t.x, t.y - 35, u.hero.palette.ring);
          else addRing(t.x, t.y, 14, 90, u.hero.palette.ring, 0.6);
        }
      });
      if (sk.effect === 'storm') {
        chosen.forEach(function (t) {
          addRing(t.x, t.y, 10, 110, u.hero.palette.ring, 0.65);
          burst(t.x, t.y, u.hero.palette.ring, 6);
        });
      }
      SFX.play('skill');
    } else if (sk.type === 'heal') {
      let targets = aliveHeroes();
      if (sk.targets === 1) {
        targets = [aliveHeroes().sort(function (a, b) {
          return a.hp / a.maxHp - b.hp / b.maxHp;
        })[0]];
      }
      targets.forEach(function (h) {
        if (h) healHero(h, h.maxHp * sk.healPct);
      });
      if (sk.buff) {
        heroes.forEach(function (h) {
          if (!h.dead) h.buffs.push({ stat: 'atk', value: sk.buff.value, until: time + sk.buff.dur });
        });
        addFloater(u.x, u.y - 210 * u.scale, '별빛 증가', '#b79bff', 17, false, 1.1);
      }
      SFX.play('heal');
    } else if (sk.type === 'shield') {
      heroes.forEach(function (h) {
        if (h.dead) return;
        h.shield = Math.min(h.maxHp * 0.6, h.shield + h.maxHp * sk.shieldPct);
        if (sk.healPct) healHero(h, h.maxHp * sk.healPct);
        addRing(h.x, h.y - 55 * h.scale, 8, 62, '#78e3ff', 0.55);
      });
      SFX.play('shield');
    }
    addUlt(3.2);
  }

  function enemyAttack(e) {
    const targets = aliveHeroes();
    if (!targets.length) return;
    const target = pick(targets);
    e.lunge = 1;
    spawnProjectile(e, target, e.atk * rnd(0.9, 1.1), false, {
      color: e.color,
      type: 'mist',
      source: 'enemy'
    });
  }

  /* ---------------- ultimate ---------------- */

  function castUltimate() {
    if (!started || phase !== 'fight') return false;
    if (ult < 100) {
      SFX.play('error');
      UI.toast('별자리 합주 충전 중 · ' + Math.floor(ult) + '%', 'bad');
      return false;
    }
    ult = 0;
    ultReady = false;
    flash = 1;
    ultFx = 1;
    shake = 8;
    camPulse = Math.max(camPulse, 0.07);
    SFX.play('ultimate');

    const living = aliveHeroes();
    const atkSum = living.reduce(function (s, h) { return s + atkOf(h); }, 0);
    const dmg = atkSum * BALANCE.ultDamageMult;

    addFloater(W / 2, 430, '별자리 합주', '#ffe7a8', 46, true, 1.5);
    addRing(W / 2, 640, 30, 420, '#ffd479', 1.1);
    addRing(W / 2, 640, 10, 260, '#78e3ff', 0.9);

    aliveEnemies().forEach(function (e) {
      hitEnemy(e, dmg, { crit: false });
      addRing(e.x, e.y, 10, 100, '#ffe7a8', 0.7);
    });
    living.forEach(function (h) {
      healHero(h, h.maxHp * BALANCE.ultHealPct);
      h.shield = Math.min(h.maxHp * 0.6, h.shield + h.maxHp * 0.1);
    });
    return true;
  }

  /* ---------------- simulation ---------------- */

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.t += dt;
      if (p.t >= p.dur) {
        if (p.source === 'enemy') {
          if (p.target && !p.target.dead) hitHero(p.target, p.raw);
        } else if (p.target && !p.target.dead) {
          hitEnemy(p.target, p.raw, { crit: p.crit });
          if (p.type === 'comet') {
            addRing(p.target.x, p.target.y, 12, 120, '#ffd479', 0.6);
            burst(p.target.x, p.target.y, '#ffd479', 10);
          }
        }
        projectiles.splice(i, 1);
      }
    }
  }

  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t += dt;
      if (f.t >= f.life) {
        floaters.splice(i, 1);
        continue;
      }
      f.y -= (f.crit ? 56 : 42) * dt;
    }
    for (let i = slashes.length - 1; i >= 0; i--) {
      slashes[i].t += dt;
      if (slashes[i].t >= slashes[i].life) slashes.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].t += dt;
      if (rings[i].t >= rings[i].life) rings.splice(i, 1);
    }
  }

  function updateCombat(dt) {
    elapsed += dt;

    heroes.forEach(function (u) {
      if (u.dead) return;
      u.buffs = u.buffs.filter(function (b) { return b.until > time; });
      u.skillTimer -= dt;
      if (u.skillTimer <= 0) {
        castSkill(u);
        u.skillTimer = u.hero.skill.cd || 8;
      }
      u.atkTimer -= dt;
      if (u.atkTimer <= 0) {
        if (aliveEnemies().length) heroAttack(u);
        u.atkTimer = u.stats.interval;
      }
    });

    enemies.forEach(function (e) {
      if (e.dead) return;
      e.atkTimer -= dt;
      if (e.atkTimer <= 0) {
        if (aliveHeroes().length) enemyAttack(e);
        e.atkTimer = e.interval;
      }
    });

    if (aliveHeroes().length === 0) {
      startDefeat(false);
      return;
    }
    if (enemies.length && enemies.every(function (e) { return e.dead; })) {
      onStageClear();
      return;
    }
    if (elapsed > BALANCE.stageTimeout) startDefeat(true);
  }

  function simulate(dt) {
    time += dt;
    if (!started || document.visibilityState === 'hidden') return;
    shake = Math.max(0, shake - dt * 42);
    flash = Math.max(0, flash - dt * 3.1);
    ultFx = Math.max(0, ultFx - dt * 1.25);
    camPulse = Math.max(0, camPulse - dt * 0.09);
    clearFx = Math.max(0, clearFx - dt * 0.8);

    if (phase === 'fight') {
      updateCombat(dt);
    } else {
      phaseT -= dt;
      if (phaseT <= 0) {
        if (phase === 'clear') {
          nextStage();
        }
      }
    }

    updateProjectiles(dt);
    updateEffects(dt);

    heroes.forEach(function (u) {
      u.flash = Math.max(0, u.flash - dt * 3.4);
      u.lunge = Math.max(0, u.lunge - dt * 5.2);
      if (u.dead) u.deadT += dt;
    });
    enemies.forEach(function (e) {
      e.flash = Math.max(0, e.flash - dt * 3.4);
      e.lunge = Math.max(0, e.lunge - dt * 5.2);
      if (e.dead) e.deadT += dt;
    });
    enemies = enemies.filter(function (e) { return !e.dead || e.deadT < 0.75; });

    uiT += dt;
    if (uiT > 0.15) {
      uiT = 0;
      updatePartyUI(false);
      UI.updateUltPct(ult, ult >= 100);
    }
  }

  function updatePartyUI(force) {
    if (!window.UI) return;
    UI.updatePartyHp(heroes.map(function (h) {
      return { id: h.id, hp: h.hp, maxHp: h.maxHp, dead: h.dead };
    }));
  }

  /* ---------------- drawing ---------------- */

  function drawBar(c, x, y, w, h, ratio, colorA, colorB) {
    roundRect(c, x, y, w, h, h / 2);
    c.fillStyle = 'rgba(4, 7, 16, .7)';
    c.fill();
    const fw = Math.max(0, Math.min(1, ratio)) * w;
    if (fw > 1) {
      roundRect(c, x, y, fw, h, h / 2);
      const g = c.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, colorA);
      g.addColorStop(1, colorB);
      c.fillStyle = g;
      c.fill();
    }
  }

  function drawHeroLabels(c) {
    heroes.forEach(function (h) {
      if (h.dead) return;
      const w = 82 * h.scale;
      const barY = h.y - 143 * h.scale;
      const x = h.x - w / 2;
      c.textAlign = 'center';
      c.font = '700 18px ' + FONT;
      c.fillStyle = 'rgba(226, 238, 255, .8)';
      c.fillText(h.name, h.x, barY - 7);
      drawBar(c, x, barY, w, 6, h.hp / h.maxHp, '#4fd6b0', '#6fd8ff');
      if (h.shield > 0) {
        const ratio = Math.min(1, h.shield / h.maxHp);
        roundRect(c, x, barY + 8, w, 3, 1.5);
        c.fillStyle = 'rgba(120, 227, 255, .16)';
        c.fill();
        roundRect(c, x, barY + 8, w * ratio, 3, 1.5);
        c.fillStyle = 'rgba(120, 227, 255, .8)';
        c.fill();
      }
    });
  }

  function drawEnemyLabels(c) {
    enemies.forEach(function (e) {
      if (e.dead) return;
      const isBoss = e.isBoss;
      const w = (isBoss ? 150 : 74) * e.scale;
      const barY = e.y - (isBoss ? 128 : 92) * e.scale;
      const x = e.x - w / 2;
      c.textAlign = 'center';
      c.font = (isBoss ? '800 22px ' : '700 16px ') + FONT;
      c.fillStyle = isBoss ? 'rgba(255, 231, 179, .95)' : 'rgba(214, 224, 255, .7)';
      c.fillText(e.name, e.x, barY - 8);
      drawBar(c, x, barY, w, isBoss ? 8 : 5, e.hp / e.maxHp, '#b9a7ff', '#8fdcff');
    });
  }

  function drawProjectiles(c) {
    projectiles.forEach(function (p) {
      const q = Math.min(1, p.t / p.dur);
      const ease = 1 - Math.pow(1 - q, 2);
      const x = p.x + (p.tx - p.x) * ease;
      const y = p.y + (p.ty - p.y) * ease - Math.sin(q * Math.PI) * 22;
      const r = p.type === 'comet' ? 24 : p.type === 'mist' ? 12 : 10;

      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = ART.rgba(p.color, 0.35);
      c.lineWidth = r * 0.8;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - (p.tx - p.x) * 0.045, y - (p.ty - p.y) * 0.045);
      c.stroke();

      const g = c.createRadialGradient(x, y, 0, x, y, r * 1.8);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.28, ART.rgba(p.color, 0.95));
      g.addColorStop(1, ART.rgba(p.color, 0));
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r * 1.8, 0, TAU);
      c.fill();
      c.restore();
    });
  }

  function drawEffects(c) {
    slashes.forEach(function (s) {
      const a = 1 - s.t / s.life;
      c.save();
      c.translate(s.x, s.y);
      c.rotate(s.angle);
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = ART.rgba(s.color, a * 0.75);
      c.lineWidth = 7 * a + 1;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0, 0, 52, -1.1, 0.75);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,' + (a * 0.55) + ')';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 56, -1.0, 0.6);
      c.stroke();
      c.restore();
    });

    rings.forEach(function (r) {
      const q = r.t / r.life;
      const rad = r.r0 + (r.r1 - r.r0) * q;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = ART.rgba(r.color, (1 - q) * 0.55);
      c.lineWidth = 3 * (1 - q) + 0.5;
      c.beginPath();
      c.ellipse(r.x, r.y, rad, rad * 0.55, 0, 0, TAU);
      c.stroke();
      c.restore();
    });

    particles.forEach(function (p) {
      const a = 1 - p.t / p.life;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = ART.rgba(p.color, a * 0.85);
      c.beginPath();
      c.arc(p.x, p.y, p.size * (0.6 + a * 0.6), 0, TAU);
      c.fill();
      c.restore();
    });
  }

  function drawFloaters(c) {
    floaters.forEach(function (f) {
      const q = f.t / f.life;
      const a = q < 0.15 ? q / 0.15 : 1 - (q - 0.15) / 0.85;
      const size = f.size * (f.crit ? 1 + (1 - Math.min(1, q * 4)) * 0.25 : 1);
      c.save();
      c.globalAlpha = Math.max(0, a);
      c.textAlign = 'center';
      c.font = '800 ' + size + 'px ' + FONT;
      c.lineWidth = Math.max(2, size * 0.16);
      c.strokeStyle = 'rgba(4, 7, 15, .65)';
      c.strokeText(f.text, f.x, f.y);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x, f.y);
      c.restore();
    });
  }

  function draw() {
    if (!ctx || !canvas || !cw || !ch) return;
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cw, ch);

    const baseScale = Math.max(cw / W, ch / H);
    const scale = baseScale * (1 + camPulse + 0.003 + Math.sin(time * 0.4) * 0.0015);
    const extraX = W * scale - cw;
    const extraY = H * scale - ch;
    const driftX = extraX > 12 ? Math.sin(time * 0.19) * Math.min(7, extraX * 0.35) : 0;
    const driftY = extraY > 12 ? Math.cos(time * 0.23) * Math.min(6, extraY * 0.3) : 0;
    const ox = (cw - W * scale) / 2 + driftX;
    const oy = ch - H * scale + driftY;
    const sx = (Math.random() * 2 - 1) * shake;
    const sy = (Math.random() * 2 - 1) * shake;
    c.setTransform(scale, 0, 0, scale, ox + sx * scale, oy + sy * scale);

    ART.background(c, W, H, time, backdrop, isBossStage(stage));

    // sort by depth
    const units = [];
    heroes.forEach(function (h) { units.push({ u: h, kind: 'hero' }); });
    enemies.forEach(function (e) { units.push({ u: e, kind: 'enemy' }); });
    units.sort(function (a, b) { return a.u.y - b.u.y; });

    units.forEach(function (item) {
      if (item.kind === 'hero') {
        const h = item.u;
        ART.hero(c, h.hero, h.x, h.y, h.scale, time, {
          alpha: h.dead ? 0.32 : 1,
          lunge: h.lunge,
          flash: h.flash
        });
      } else {
        const e = item.u;
        ART.enemy(c, e, e.x, e.y, e.scale, time, {
          flash: e.flash,
          alpha: e.dead ? Math.max(0, 1 - e.deadT * 1.3) : 1,
          deadT: e.dead ? e.deadT : 0
        });
      }
    });

    drawHeroLabels(c);
    drawEnemyLabels(c);
    drawProjectiles(c);
    drawEffects(c);
    drawFloaters(c);

    if (clearFx > 0) {
      const p = 1 - clearFx;
      const a = Math.sin(p * Math.PI);
      const bx = -280 + p * (W + 560);
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.translate(bx, H * 0.5);
      c.rotate(-0.28);
      const band = c.createLinearGradient(-190, 0, 190, 0);
      band.addColorStop(0, 'rgba(160, 220, 255, 0)');
      band.addColorStop(0.45, 'rgba(255, 246, 214, ' + (0.13 * a) + ')');
      band.addColorStop(0.55, 'rgba(255, 255, 255, ' + (0.19 * a) + ')');
      band.addColorStop(1, 'rgba(160, 220, 255, 0)');
      c.fillStyle = band;
      c.fillRect(-190, -H, 380, H * 2);
      c.restore();
    }

    if (ultFx > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const a = ultFx;
      const beam = c.createLinearGradient(0, 0, 0, H);
      beam.addColorStop(0, 'rgba(255, 240, 190, 0)');
      beam.addColorStop(0.3, 'rgba(255, 232, 165, ' + (0.45 * a) + ')');
      beam.addColorStop(1, 'rgba(120, 220, 255, 0)');
      c.fillStyle = beam;
      c.fillRect(W / 2 - 90, 0, 180, H);
      const rg = c.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, 330);
      rg.addColorStop(0, 'rgba(255, 232, 170, ' + (0.3 * a) + ')');
      rg.addColorStop(1, 'rgba(255, 232, 170, 0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, W, H);
      c.restore();
    }

    if (flash > 0) {
      c.fillStyle = 'rgba(205, 235, 255,' + (flash * 0.26) + ')';
      c.fillRect(0, 0, W, H);
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (dt > 0.06) dt = 0.06;

    if (window.Game && Game.state) simulate(dt);
    const screen = document.getElementById('screen-battle');
    if (screen && screen.classList.contains('active')) draw();
  }

  function resize() {
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    cw = w;
    ch = h;
  }

  function init(canvasEl, wrapEl) {
    canvas = canvasEl;
    wrap = wrapEl;
    ctx = canvas.getContext('2d');
    backdrop = ART.makeBackdrop();
    resize();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(function () { resize(); });
      ro.observe(wrap);
    }
    document.addEventListener('visibilitychange', function () {
      lastTs = 0;
    });
    if (!running) {
      running = true;
      lastTs = 0;
      raf = requestAnimationFrame(loop);
    }
  }

  function snapshot() {
    if (!started || !Game.state.run || Game.state.run.status !== 'active') return null;
    return JSON.parse(JSON.stringify({
      schema: 1, stage: stage, phase: phase, phaseT: phaseT, elapsed: elapsed, ult: ult, time: time, clearStarted: clearStarted,
      heroes: heroes.map(function (h) { return {id: h.id, hp: h.hp, shield: h.shield, dead: h.dead, deadT: h.deadT, buffs: h.buffs, atkTimer: h.atkTimer, skillTimer: h.skillTimer}; }),
      enemies: enemies,
      projectiles: projectiles.map(function (p) { return Object.assign({}, p, {target: {id: p.target.id, side: p.source === 'enemy' ? 'hero' : 'enemy'}}); })
    }));
  }
  function start() {
    const run = Game.state.run;
    if (!run || run.status !== 'active') return false;
    const saved = run.snapshot;
    started = true;
    syncParty({full: true});
    ult = 0; ultReady = false;
    beginStage(run.stage, {full: true});
    if (saved && saved.schema === 1 && saved.stage === run.stage && ['fight', 'clear'].indexOf(saved.phase) >= 0 && Array.isArray(saved.enemies)) {
      stage = saved.stage; phase = saved.phase; phaseT = saved.phaseT; elapsed = saved.elapsed;
      ult = saved.ult; time = saved.time; clearStarted = !!saved.clearStarted;
      heroes.forEach(function (h) {
        const old = saved.heroes.find(function (x) { return x.id === h.id; });
        if (old) Object.assign(h, old, {hp: Math.min(h.maxHp, Math.max(0, old.hp))});
      });
      enemies = saved.enemies;
      projectiles = (saved.projectiles || []).map(function (p) {
        const target = (p.target.side === 'hero' ? heroes : enemies).find(function (u) { return u.id === p.target.id; });
        return target ? Object.assign({}, p, {target: target}) : null;
      }).filter(Boolean);
    }
    updatePartyUI(true); UI.updateUltPct(ult, ult >= 100);
    return true;
  }
  function stop() {
    started = false; phase = 'ended'; ult = 0; ultReady = false;
    projectiles = []; particles = []; floaters = []; slashes = []; rings = [];
    UI.updateUltPct(0, false);
  }

  function pause() {
    started = false;
  }

  return {
    init: init,
    start: start,
    stop: stop,
    snapshot: snapshot,
    get started() { return started; },
    pause: pause,
    syncParty: syncParty,
    castUltimate: castUltimate,
    get stage() { return stage; },
    get ult() { return ult; },
    get heroes() { return heroes; },
    get phase() { return phase; }
  };
})();
