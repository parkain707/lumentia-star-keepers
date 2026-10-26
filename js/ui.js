'use strict';

function fmt(n) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (n < 1e6) return n.toLocaleString('ko-KR');
  if (n < 1e8) {
    const v = n / 1e4;
    return (v >= 100 ? Math.floor(v) : v.toFixed(1).replace(/\.0$/, '')) + '만';
  }
  if (n < 1e12) {
    const v = n / 1e8;
    return (v >= 100 ? Math.floor(v) : v.toFixed(1).replace(/\.0$/, '')) + '억';
  }
  const v = n / 1e12;
  return (v >= 100 ? Math.floor(v) : v.toFixed(1).replace(/\.0$/, '')) + '조';
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + '시간 ' + m + '분';
  if (m > 0) return m + '분';
  return sec + '초';
}

const UI = (function () {
  const els = {};
  let bannerTimer = null;
  let currentTab = 'battle';
  let lastUlt = -1;
  let lastUltReady = null;
  let reportTotal = 0;
  let reportCount = 0;
  let reportHideTimer = null;
  let reportResetTimer = null;

  const MISSION_ICONS = {
    stage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V3M6 4h11l-2.4 4L17 12H6"/></svg>',
    summon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>',
    boss: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.8-3.3 7.7-8 9-4.7-1.3-8-4.2-8-9V6l8-3z"/><path d="M9 11.5h.01M15 11.5h.01M9.5 15.5c1.6 1 3.4 1 5 0"/></svg>',
    level: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5M6 11l6-6 6 6"/></svg>',
    team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.5-3.5 2.7-5.3 5.5-5.3s5 1.8 5.5 5.3"/><circle cx="17.5" cy="9.5" r="2.3"/><path d="M16 15c2.4.1 4.1 1.7 4.6 4.4"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.5 5.6 6.1.7-4.5 4.2 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.2 6.1-.7L12 3z"/></svg>',
    power: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>'
  };

  function el(id) { return document.getElementById(id); }
  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function paintPortraits(root) {
    root = root || document;
    function render() {
      root.querySelectorAll('canvas[data-portrait]').forEach(function (cv) {
        if (cv.closest('[hidden]')) return;
        const hero = HERO_BY_ID[cv.dataset.portrait];
        if (hero) ART.portrait(cv, hero, {});
      });
    }
    requestAnimationFrame(render);
    setTimeout(render, 80);
    setTimeout(render, 260);
  }

  function init() {
    els.hudGold = el('hud-gold');
    els.hudGems = el('hud-gems');
    els.stageNum = el('stage-num');
    els.stageChapter = el('stage-chapter');
    els.stageBoss = el('stage-boss-tag');
    els.stageHaze = el('stage-haze-tag');
    els.best = el('best-stage');
    els.power = el('party-power');
    els.teacherReport = el('teacher-report');
    els.teacherText = el('teacher-report-text');
    els.partyRow = el('party-row');
    els.formation = el('formation');
    els.rosterCount = el('roster-count');
    els.heroGrid = el('hero-grid');
    els.missionList = el('mission-list');
    els.missionDone = el('mission-done');
    els.banner = el('stage-banner');
    els.ultBtn = el('ult-btn');
    els.ultPct = el('ult-pct');
    els.ultRing = el('ult-ring');
    els.income = el('income-chip');
    els.pityLeft = el('pity-left');
    els.freeTen = el('btn-free-ten');
    els.summonDot = el('summon-dot');
    els.missionsDot = el('missions-dot');
    els.toasts = el('toasts');
    els.modalRoot = el('modal-root');
    els.gachaRoot = el('gacha-root');
    els.bulkHint = el('bulk-hint');
    els.cost1 = document.querySelector('#btn-summon1 .summon-price b');
    els.cost10 = document.querySelector('#btn-summon10 .summon-price b');
    els.toggleSfx = null;

    els.potBar = el('pot-bar');
    els.potAmount = el('pot-amount');
    els.potDangerTag = el('pot-danger-tag');
    els.dailyBadge = el('daily-play-badge');
    els.btnCashout = el('btn-cashout');

    // Interactive Guide Navigator Elements
    els.guideBanner = el('guide-banner');
    els.guideTitle = el('guide-step-title');
    els.guideDesc = el('guide-step-desc');
    els.guideActionBtn = el('guide-action-btn');

    if (els.guideActionBtn) {
      els.guideActionBtn.addEventListener('click', function () {
        if (!window.Game || !Game.getGuideStep) return;
        const step = Game.getGuideStep();
        if (!step) return;
        SFX.play('click');
        if (step.target === 'ult') {
          showTab('battle');
          if (window.Battle) Battle.castUltimate();
        } else if (step.tab) {
          showTab(step.tab);
        }
      });
    }

    setText(els.cost1, fmt(GACHA.cost1));
    setText(els.cost10, fmt(GACHA.cost10));

    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        SFX.play('click');
        showTab(btn.dataset.tab);
      });
    });

    el('btn-settings').addEventListener('click', function () {
      SFX.play('click');
      openSettings();
    });
    el('btn-guide').addEventListener('click', function () {
      SFX.play('click');
      openGuide();
    });
    const topCertBtn = document.getElementById('btn-top-cert');
    if (topCertBtn) {
      topCertBtn.addEventListener('click', function () {
        SFX.play('click');
        openTeacherCertificate();
      });
    }
    if (els.teacherReport) {
      els.teacherReport.addEventListener('click', function () {
        SFX.play('click');
        openTeacherCertificate();
      });
    }
    el('btn-rates').addEventListener('click', function () {
      SFX.play('click');
      openRates();
    });
    el('btn-bulk-level').addEventListener('click', bulkLevel);

    if (els.btnCashout) {
      els.btnCashout.addEventListener('click', function () {
        SFX.play('click');
        if (typeof Game === 'undefined') return;
        const pot = Game.getChallengePot();
        if (pot <= 0) {
          toast('수령할 누적 미소가 없습니다. 별길을 밝혀 미소를 모으세요!');
          return;
        }
        if (confirm('지금 도전을 멈추고 지금까지 모은 +' + fmt(pot) + ' 미소를 안전하게 수령하시겠습니까?\n\n수령 즉시 선생님께 제출할 [미소 청구 인증서]가 발급됩니다!')) {
          Game.cashoutChallengePot();
        }
      });
    }

    els.ultBtn.addEventListener('click', function () {
      SFX.init();
      const ok = Battle.castUltimate();
      if (ok) {
        lastUlt = -1;
        updateUltPct(0, false);
      }
    });

    el('btn-summon1').addEventListener('click', function () { doSummon(1, false); });
    el('btn-summon10').addEventListener('click', function () { doSummon(10, false); });
    els.freeTen.addEventListener('click', function () { doSummon(10, true); });

    els.heroGrid.addEventListener('click', function (e) {
      const card = e.target.closest('.hero-card');
      if (!card) return;
      if (card.classList.contains('locked')) {
        SFX.play('error');
        toast('아직 만나지 못한 영웅입니다 · 소환으로 계약할 수 있어요');
        return;
      }
      SFX.play('click');
      openHero(card.dataset.hero);
    });

    els.formation.addEventListener('click', function (e) {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      SFX.play('click');
      openPicker(Number(slot.dataset.slot));
    });

    els.missionList.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-claim]');
      if (!btn) return;
      const result = Game.claimAchievement(btn.dataset.claim);
      if (result.ok) {
        SFX.play('claim');
        toast(result.label + ' 보상 수령 완료', 'gold');
        renderMissions();
        renderHUD();
      } else {
        SFX.play('error');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    renderAll();
    updateKeeperHUD();
  }

  /* ---------------- tabs ---------------- */

  function showTab(tab) {
    if (tab === 'cert') {
      openTeacherCertificate();
      return;
    }
    currentTab = tab;
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('active', s.dataset.screen === tab);
    });
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    if (tab === 'heroes') renderHeroes();
    if (tab === 'summon') renderSummon();
    if (tab === 'missions') renderMissions();
    if (tab === 'battle') {
      window.dispatchEvent(new Event('resize'));
      setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 60);
    }
    const screen = el('screen-' + tab);
    if (screen) screen.scrollTop = 0;
  }

  /* ---------------- HUD ---------------- */

  function renderHUD() {
    if (!Game.state) return;
    setText(els.hudGold, fmt(Game.state.gold));
    setText(els.hudGems, fmt(Game.state.gems));
    setText(els.best, String(Game.state.highest));
    updatePower();
    updateIncome();
    updatePity();
    updateDots();
    updateGuideBanner();
    renderChallengePot();
  }

  function renderChallengePot() {
    if (!els.potAmount || typeof Game === 'undefined') return;
    const pot = Game.getChallengePot();
    setText(els.potAmount, '+' + fmt(pot) + ' 미소');
    if (els.btnCashout) {
      els.btnCashout.disabled = pot <= 0;
    }
    if (els.potDangerTag) {
      els.potDangerTag.hidden = pot < 2500;
    }
    if (els.potBar) {
      els.potBar.classList.toggle('danger', pot >= 2500);
    }
    updateDailyBadge();
  }

  function updateDailyBadge() {
    if (!els.dailyBadge || typeof Game === 'undefined') return;
    const daily = Game.checkDailyPlays();
    setText(els.dailyBadge, '도전: ' + daily.available + '/2');
    els.dailyBadge.classList.toggle('empty', daily.available === 0);
  }

  function openDailyLimitModal() {
    modal(
      '<div class="modal-head"><div><p class="eyebrow">DAILY LIMIT</p><h2>오늘의 도전 완료</h2></div>' +
        '<button class="modal-x" data-close aria-label="닫기">×</button></div>' +
      '<div class="info-note" style="background:rgba(255,212,121,.08);border-color:rgba(255,212,121,.3);color:#fff;font-size:13px;line-height:1.7;">' +
        '✨ <b>오늘의 별빛 도전 기회(하루 2회)를 모두 마쳤습니다!</b><br>' +
        '선생님과의 약속대로 내일 새로운 별빛이 뜰 때 다시 도전해 주세요.<br><br>' +
        '지금까지 획득한 미소는 <b>[선생님 미소 청구 인증서]</b>로 발급받아 선생님께 제출할 수 있습니다.' +
      '</div>' +
      '<div class="btn-row" style="margin-top:14px;">' +
        '<button type="button" class="btn-primary" id="btn-daily-open-cert">📜 선생님께 미소 청구 인증서 발급</button>' +
        '<button type="button" class="btn-ghost" data-close>확인</button>' +
      '</div>'
    );
    const certBtn = document.querySelector('#btn-daily-open-cert');
    if (certBtn) {
      certBtn.addEventListener('click', function () {
        SFX.play('click');
        closeModal();
        openTeacherCertificate();
      });
    }
  }

  function updateGuideBanner() {
    if (!els.guideBanner || !window.Game || !Game.getGuideStep) return;
    const step = Game.getGuideStep();
    if (!step) return;

    if (els.guideTitle) setText(els.guideTitle, step.title);
    if (els.guideDesc) setText(els.guideDesc, step.desc);

    // Pulse highlight management
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.remove('guide-pulse');
    });
    if (els.ultBtn) els.ultBtn.classList.remove('guide-pulse');

    if (step.target === 'ult') {
      if (els.ultBtn) els.ultBtn.classList.add('guide-pulse');
    } else if (step.tab) {
      const targetBtn = document.querySelector('.nav-btn[data-tab="' + step.tab + '"]');
      if (targetBtn && currentTab !== step.tab) {
        targetBtn.classList.add('guide-pulse');
      }
    }
  }

  function updatePower() {
    if (!Game.state) return;
    setText(els.power, fmt(Game.partyPower()));
  }

  function updateIncome() {
    if (!Game.state) return;
    const rate = Game.goldRate(Game.state.highest);
    setText(els.income, '+' + fmt(Math.floor(rate)) + ' /초');
  }

  function updatePity() {
    if (!Game.state) return;
    const left = Math.max(1, Math.min(GACHA.pity, GACHA.pity - Game.state.pity));
    setText(els.pityLeft, String(left));
  }

  function updateDots() {
    if (!Game.state) return;
    els.summonDot.hidden = !Game.state.freeTen;
    els.missionsDot.hidden = !Game.hasClaimableAchievement();
  }

  function setStage(stage, boss, highest) {
    setText(els.stageNum, String(stage));
    setText(els.stageChapter, chapterOf(stage));
    els.stageBoss.hidden = !boss;
    if (els.stageHaze) els.stageHaze.hidden = stage < BALANCE.hardStage;
    setText(els.best, String(Math.max(highest, Game.state.highest)));
    updatePower();
    updateIncome();
  }

  function updateUltPct(pct, ready) {
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    if (p !== lastUlt) {
      lastUlt = p;
      els.ultRing.style.setProperty('--p', String(p));
      els.ultPct.textContent = ready ? '해방 가능' : (p >= 100 ? '해방 가능' : p + '%');
    }
    if (ready !== lastUltReady) {
      lastUltReady = ready;
      els.ultBtn.classList.toggle('ready', !!ready);
    }
  }

  function updatePartyHp(snapshot) {
    if (!snapshot) return;
    snapshot.forEach(function (s) {
      const chip = els.partyRow.querySelector('.party-chip[data-hero="' + s.id + '"]');
      if (!chip) return;
      const bar = chip.querySelector('.hp-bar i');
      const ratio = s.maxHp > 0 ? Math.max(0, Math.min(1, s.hp / s.maxHp)) : 0;
      bar.style.width = (ratio * 100).toFixed(1) + '%';
      chip.classList.toggle('dead', !!s.dead);
      chip.classList.toggle('low', ratio < 0.3);
    });
  }

  function renderParty() {
    if (!Game.state) return;
    els.partyRow.innerHTML = Game.state.party.map(function (id) {
      const hero = HERO_BY_ID[id];
      if (!hero) return '';
      const info = Game.heroInfo(id);
      const rar = RARITY[hero.rarity];
      return (
        '<div class="party-chip" data-hero="' + id + '" style="--rs:' + rar.soft + '">' +
          '<span class="party-art"><canvas data-portrait="' + id + '"></canvas></span>' +
          '<div class="party-meta">' +
            '<div class="party-name">' + hero.name + '</div>' +
            '<div class="party-lv">Lv.' + info.lv + ' · ' + CLASSES[hero.cls].name + '</div>' +
            '<div class="hp-bar"><i></i></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    paintPortraits(els.partyRow);
  }

  /* ---------------- heroes ---------------- */

  function renderHeroes() {
    if (!Game.state) return;
    setText(els.rosterCount, '보유 ' + Game.state.owned.length + ' / ' + HEROES.length);

    els.formation.innerHTML = [0, 1, 2].map(function (slot) {
      const id = Game.state.party[slot];
      const hero = id ? HERO_BY_ID[id] : null;
      if (!hero) {
        return (
          '<button class="slot" data-slot="' + slot + '">' +
            '<span class="slot-empty-plus">+</span>' +
            '<span class="slot-empty-label">빈 슬롯</span>' +
          '</button>'
        );
      }
      const info = Game.heroInfo(id);
      const rar = RARITY[hero.rarity];
      return (
        '<button class="slot filled" data-slot="' + slot + '" style="--rc:' + rar.color + ';--rs:' + rar.soft + ';--rb:' + rar.border + '">' +
          '<span class="slot-rar">' + rar.label + '</span>' +
          '<span class="slot-art"><canvas data-portrait="' + id + '"></canvas></span>' +
          '<span class="slot-name">' + hero.name + '</span>' +
          '<span class="slot-lv">Lv.' + info.lv + (info.star > 1 ? ' · ' + info.star + '성' : '') + '</span>' +
        '</button>'
      );
    }).join('');

    const sorted = HEROES.slice().sort(function (a, b) {
      const order = { SSR: 0, SR: 1, R: 2 };
      if (order[a.rarity] !== order[b.rarity]) return order[a.rarity] - order[b.rarity];
      const ao = Game.state.owned.indexOf(a.id) >= 0 ? 0 : 1;
      const bo = Game.state.owned.indexOf(b.id) >= 0 ? 0 : 1;
      return ao - bo;
    });

    els.heroGrid.innerHTML = sorted.map(function (hero) {
      const rar = RARITY[hero.rarity];
      const owned = Game.state.owned.indexOf(hero.id) >= 0;
      const info = owned ? Game.heroInfo(hero.id) : null;
      const inParty = Game.state.party.indexOf(hero.id) >= 0;
      const pips = [1, 2, 3, 4, 5].map(function (n) {
        return '<i class="' + (info && n <= info.star ? 'on' : '') + '"></i>';
      }).join('');
      let foot;
      if (owned) {
        const next = info.star < 5 ? RARITY[hero.rarity].shardCosts[info.star - 1] : null;
        foot = next
          ? '<span class="shard-mini">조각 <b>' + info.shards + '</b> / ' + next + '</span>'
          : '<span class="shard-mini">각성 완료</span>';
      } else {
        foot = '<span class="shard-mini">미보유</span>';
      }
      return (
        '<button class="hero-card ' + (owned ? '' : 'locked ') + (inParty ? 'in-party' : '') + '" ' +
          'data-hero="' + hero.id + '" style="--rc:' + rar.color + ';--rs:' + rar.soft + ';--rb:' + rar.border + '">' +
          '<div class="card-top"><span class="rar-badge">' + rar.label + '</span>' +
            '<span class="card-lv">' + (owned ? 'Lv.' + info.lv : '미보유') + '</span></div>' +
          '<div class="card-art"><canvas data-portrait="' + hero.id + '"></canvas></div>' +
          '<div class="card-name">' + (owned ? hero.name : '???') + '</div>' +
          '<div class="card-sub">' + (owned ? hero.title : '아직 만나지 못한 별') + '</div>' +
          '<div class="card-foot"><span class="pips">' + pips + '</span>' + foot + '</div>' +
        '</button>'
      );
    }).join('');

    paintPortraits(els.heroGrid);
    paintPortraits(els.formation);
    const party = Game.state.party;
    const levelable = party.some(function (id) { return Game.canLevelAny(id); });
    setText(els.bulkHint, levelable ? '미소로 레벨 업' : '미소 부족');
  }

  function openPicker(slot) {
    const list = Game.state.owned.map(function (id) {
      const hero = HERO_BY_ID[id];
      const rar = RARITY[hero.rarity];
      const info = Game.heroInfo(id);
      const isCurrent = Game.state.party[slot] === id;
      return (
        '<button class="pick ' + (isCurrent ? 'current' : '') + '" data-pick="' + id + '" ' +
          'style="--rc:' + rar.color + ';--rs:' + rar.soft + ';--rb:' + rar.border + '">' +
          '<canvas data-portrait="' + id + '"></canvas>' +
          '<b>' + hero.name + '</b>' +
          '<span>Lv.' + info.lv + ' · ' + CLASSES[hero.cls].name + '</span>' +
        '</button>'
      );
    }).join('');

    const m = modal(
      '<div class="modal-head"><div><h2>함께할 동행 선택</h2><p>' + (slot + 1) + '번째 자리에 함께할 동행을 골라 주세요.</p></div>' +
      '<button class="modal-x" data-close aria-label="닫기">×</button></div>' +
      '<div class="pick-grid">' + list + '</div>'
    );
    paintPortraits(m);
    m.querySelectorAll('[data-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        Game.setPartySlot(slot, btn.dataset.pick);
        SFX.play('click');
        closeModal();
        renderHeroes();
        renderParty();
        updatePower();
        toast(HERO_BY_ID[btn.dataset.pick].name + ' 동행으로 함께합니다');
      });
    });
  }

  function openHero(id, scrollTop) {
    const hero = HERO_BY_ID[id];
    if (!hero) return;
    const info = Game.heroInfo(id);
    const rar = RARITY[hero.rarity];
    const cls = CLASSES[hero.cls];
    const inParty = Game.state.party.indexOf(id) >= 0;
    const stars = [1, 2, 3, 4, 5].map(function (n) {
      return '<i class="' + (n <= info.star ? 'on' : '') + '"></i>';
    }).join('');
    const capReached = info.lv >= info.cap;
    const levelCost = info.levelCost;
    const ascend = info.ascend;
    const shardPct = ascend.max ? 100 : Math.min(100, (info.shards / ascend.need) * 100);

    const m = modal(
      '<div class="modal-head"><div><p class="eyebrow">' + rar.name + '</p><h2>영웅 정보</h2></div>' +
        '<button class="modal-x" data-close aria-label="닫기">×</button></div>' +
      '<div class="hero-top">' +
        '<div class="hero-portrait" style="--rs:' + rar.soft + ';--rb:' + rar.border + '"><canvas data-portrait="' + id + '"></canvas></div>' +
        '<div class="hero-id">' +
          '<span class="rar-badge">' + rar.label + '</span>' +
          '<div class="hero-name">' + hero.name + '</div>' +
          '<div class="hero-title">' + hero.title + ' · ' + cls.name + '</div>' +
          '<div class="hero-tags"><span class="tag">' + cls.role + '</span>' +
            '<span class="tag ' + (inParty ? 'gold' : '') + '">' + (inParty ? '함께하는 중' : '쉬는 중') + '</span></div>' +
          '<div class="hero-stars">' + stars + '<span>' + info.star + '성</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="stat-grid">' +
        '<div class="stat-cell"><span>기운</span><b>' + fmt(info.stats.hp) + '</b></div>' +
        '<div class="stat-cell"><span>별빛</span><b>' + fmt(info.stats.atk) + '</b></div>' +
        '<div class="stat-cell"><span>수호</span><b>' + fmt(info.stats.def) + '</b></div>' +
        '<div class="stat-cell"><span>별빛 주기</span><b>' + info.stats.interval.toFixed(2) + '초</b></div>' +
      '</div>' +
      '<div class="skill-box">' +
        '<div class="skill-head"><b>' + hero.skill.name + '</b><span>쿨 ' + hero.skill.cd.toFixed(1) + '초</span></div>' +
        '<p>' + hero.skill.desc + '</p>' +
        '<div class="passive-line"><b>패시브</b><span>' + hero.passive.text + '</span></div>' +
      '</div>' +
      '<div class="growth-box">' +
        '<div class="growth-head"><b>레벨 ' + info.lv + '</b><span>/ ' + info.cap + (capReached ? ' · 각성 필요' : '') + '</span></div>' +
        (capReached
          ? '<div class="growth-note">레벨 상한에 도달했습니다. 각성하면 상한이 20 올라갑니다.</div>'
          : '<div class="cost-line">강화 비용 <b>' + fmt(levelCost) + '</b> 미소</div>') +
        '<div class="growth-actions">' +
          '<button data-lv="1" ' + (capReached ? 'disabled' : '') + '>+1</button>' +
          '<button data-lv="10" ' + (capReached ? 'disabled' : '') + '>+10</button>' +
          '<button class="prime" data-lv="max" ' + (capReached ? 'disabled' : '') + '>최대</button>' +
        '</div>' +
      '</div>' +
      '<div class="growth-box">' +
        '<div class="growth-head"><b>각성 ' + info.star + '성' + (ascend.max ? ' · 완료' : ' → ' + (info.star + 1) + '성') + '</b>' +
          '<span>' + (ascend.max ? '최대 각성' : '능력치 +25%') + '</span></div>' +
        (ascend.max
          ? '<div class="growth-note">이 영웅은 최대 각성 상태입니다.</div>'
          : '<div class="shard-bar"><i style="width:' + shardPct.toFixed(1) + '%"></i></div>' +
            '<div class="cost-line">조각 <b>' + info.shards + '</b> / ' + ascend.need +
              ' · 미소 <b>' + fmt(ascend.gold) + '</b></div>' +
            '<button class="btn-ghost" data-ascend ' + (ascend.can ? '' : 'disabled') + '>각성하기</button>' +
            '<div class="growth-note">각성 시 능력치가 25% 상승하고 레벨 상한이 20 올라갑니다.</div>') +
      '</div>' +
      '<div class="hero-sheet-actions"><button class="btn-ghost" data-close>닫기</button></div>',
      { wide: true }
    );

    paintPortraits(m);
    if (scrollTop) m.scrollTop = scrollTop;

    m.addEventListener('click', function (e) {
      const lvBtn = e.target.closest('[data-lv]');
      if (lvBtn) {
        const mode = lvBtn.dataset.lv;
        const res = Game.levelHero(id, mode === 'max' ? 'max' : Number(mode));
        if (res.levels > 0) {
          SFX.play('levelup');
          toast(hero.name + ' Lv.' + res.from + ' → Lv.' + res.to, 'gold');
          openHero(id, m.scrollTop);
          refreshGrowthUI();
        } else {
          SFX.play('error');
          toast(res.reason || '강화할 수 없습니다', 'bad');
        }
        return;
      }
      const ascBtn = e.target.closest('[data-ascend]');
      if (ascBtn) {
        const res = Game.ascendHero(id);
        if (res.ok) {
          SFX.play('ascend');
          toast(hero.name + ' ' + res.star + '성 각성!', 'gold');
          openHero(id, m.scrollTop);
          refreshGrowthUI();
        } else {
          SFX.play('error');
          toast(res.reason || '각성할 수 없습니다', 'bad');
        }
      }
    });
  }

  function bulkLevel() {
    const res = Game.levelPartyBulk();
    if (res.levels > 0) {
      SFX.play('levelup');
      toast('동행 함께 성장 · 총 ' + res.levels + '레벨 상승', 'gold');
      refreshGrowthUI();
    } else {
      SFX.play('error');
      toast(res.reason || '성장에 필요한 미소가 부족합니다', 'bad');
    }
  }

  function refreshGrowthUI() {
    renderHUD();
    renderParty();
    if (currentTab === 'heroes') renderHeroes();
    renderMissions();
    updatePower();
  }

  /* ---------------- summon ---------------- */

  function renderSummon() {
    updatePity();
    updateDots();
    els.freeTen.hidden = !Game.state.freeTen;
  }

  function doSummon(count, free) {
    SFX.init();
    const res = Game.summon(count, free);
    if (!res.ok) {
      SFX.play('error');
      toast(res.reason, 'bad');
      openGachaStoreHint();
      return;
    }
    SFX.play('summon');
    showGacha(res);
    renderHUD();
    renderSummon();
  }

  function openGachaStoreHint() {
    if (Game.state.gems < GACHA.cost1) {
      setTimeout(function () {
        toast('별빛은 스테이지 첫 클리어와 임무 보상으로 얻을 수 있어요');
      }, 300);
    }
  }

  function showGacha(res) {
    const results = res.results;
    const cards = results.map(function (r, i) {
      const hero = HERO_BY_ID[r.heroId];
      const rar = RARITY[hero.rarity];
      const tagClass = r.isNew ? 'new' : '';
      const tag = r.isNew ? 'NEW' : '조각 +' + r.shards;
      return (
        '<div class="g-card ' + rar.key.toLowerCase() + '" data-index="' + i + '" ' +
          'style="--rc:' + rar.color + ';--rs:' + rar.soft + ';--rb:' + rar.border + '">' +
          '<div class="g-inner">' +
            '<div class="g-face g-back"></div>' +
            '<div class="g-face g-front">' +
              '<canvas data-portrait="' + hero.id + '"></canvas>' +
              '<span class="g-rar">' + rar.label + '</span>' +
              '<span class="g-name">' + hero.name + '</span>' +
              '<span class="g-tag ' + tagClass + '">' + tag + '</span>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    els.gachaRoot.innerHTML =
      '<div class="gacha">' +
        '<div class="gacha-head"><p>STARLIGHT SUMMON</p><h2>' + (res.free ? '초대 소환' : '별이 응답했다') + '</h2></div>' +
        '<div class="gacha-grid ' + (results.length === 1 ? 'single' : '') + '" id="gacha-grid">' + cards + '</div>' +
        '<p class="gacha-note">중복 영웅은 조각으로 변환됩니다 · SSR 확정까지 ' + res.pityLeft + '회</p>' +
        '<div class="gacha-actions">' +
          '<button class="skip" id="gacha-skip" hidden>모두 보기</button>' +
          '<button class="ok" id="gacha-ok">확인</button>' +
        '</div>' +
      '</div>';
    paintPortraits(els.gachaRoot);

    const cardEls = Array.prototype.slice.call(els.gachaRoot.querySelectorAll('.g-card'));
    const timers = [];
    let done = false;

    function complete() {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      const skip = el('gacha-skip');
      if (skip) skip.hidden = true;
      cardEls.forEach(function (c) { c.classList.add('revealed'); });
    }

    cardEls.forEach(function (card, i) {
      card.addEventListener('click', function () {
        const r = results[i];
        if (r && r.heroId) {
          SFX.play('click');
          openHero(r.heroId);
        }
      });
      timers.push(setTimeout(function () {
        if (done) return;
        card.classList.add('revealed');
        const r = results[i];
        if (r && r.rarity === 'SSR') SFX.play('ssr');
        else if (r && r.rarity === 'SR') SFX.play('sr');
        if (i === cardEls.length - 1) complete();
      }, 180 + i * 105));
    });

    const ok = el('gacha-ok');
    const skip = el('gacha-skip');
    if (skip) skip.hidden = false;
    if (ok) ok.hidden = true;

    if (skip) skip.addEventListener('click', function () {
      complete();
      SFX.play('click');
      if (ok) ok.hidden = false;
    });

    if (ok) ok.addEventListener('click', function () {
      els.gachaRoot.innerHTML = '';
      SFX.play('click');
      refreshAll();
      if (res.summary.newCount > 0) {
        toast('새 영웅 ' + res.summary.newCount + '명 · 중복 조각 +' + res.summary.shards, 'gold');
      }
      if (res.pityReset) {
        setTimeout(function () { toast('SSR 확정! 성좌가 응답했습니다', 'gold'); }, 300);
      }
      showTab('heroes');
    });

    setTimeout(function () {
      if (!done) return;
      if (ok) ok.hidden = false;
    }, 180 + results.length * 105 + 200);
  }

  /* ---------------- missions ---------------- */

  function renderMissions() {
    if (!Game.state) return;
    const list = Game.achievementState();
    els.missionList.innerHTML = list.map(function (a) {
      const pct = Math.min(100, (a.progress / a.target) * 100);
      const claimed = a.claimed;
      const ready = !claimed && a.progress >= a.target;
      const rewards = [];
      if (a.reward.gems) rewards.push('<span><i class="ico ico-gem"></i>' + fmt(a.reward.gems) + '</span>');
      if (a.reward.gold) rewards.push('<span><i class="ico ico-gold"></i>' + fmt(a.reward.gold) + '</span>');
      return (
        '<div class="mission ' + (claimed ? 'claimed' : '') + '">' +
          '<div class="mission-ico">' + (MISSION_ICONS[a.icon] || MISSION_ICONS.star) + '</div>' +
          '<div class="mission-main">' +
            '<div class="mission-title">' + a.title + '</div>' +
            '<div class="mission-desc">' + a.desc + '</div>' +
            '<div class="mission-bar"><i style="width:' + pct.toFixed(0) + '%"></i></div>' +
            '<div class="mission-rewards">' + rewards.join('') + '</div>' +
          '</div>' +
          '<button class="mission-claim ' + (ready ? 'ready' : '') + '" data-claim="' + a.id + '" ' +
            (claimed || !ready ? 'disabled' : '') + '>' +
            (claimed ? '완료' : ready ? '받기' : Math.floor(pct) + '%') +
          '</button>' +
        '</div>'
      );
    }).join('');

    const claimed = list.filter(function (a) { return a.claimed; }).length;
    setText(els.missionDone, claimed + ' / ' + list.length);
  }

  /* ---------------- modal helpers ---------------- */

  function modal(html, opts) {
    opts = opts || {};
    closeModal();
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML = '<div class="modal">' + html + '</div>';
    if (!opts.sticky) {
      back.addEventListener('click', function (e) {
        if (e.target === back) closeModal();
      });
    }
    back.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) closeModal();
    });
    els.modalRoot.appendChild(back);
    const box = back.querySelector('.modal');
    paintPortraits(box);
    return box;
  }

  function closeModal() {
    els.modalRoot.innerHTML = '';
  }

  /* ---------------- teacher report ---------------- */

  function showTeacherReport(amount, label) {
    if (!els.teacherReport) return;
    reportTotal += amount;
    reportCount += 1;
    setText(
      els.teacherText,
      '미소 +' + fmt(reportTotal) + (reportCount > 1 ? ' · ' + reportCount + '건' : ' · ' + label)
    );
    els.teacherReport.hidden = false;
    els.teacherReport.classList.remove('pop');
    void els.teacherReport.offsetWidth;
    els.teacherReport.classList.add('pop');
    clearTimeout(reportHideTimer);
    reportHideTimer = setTimeout(function () {
      els.teacherReport.classList.remove('pop');
      els.teacherReport.hidden = true;
    }, 2800);
    clearTimeout(reportResetTimer);
    reportResetTimer = setTimeout(function () {
      reportTotal = 0;
      reportCount = 0;
    }, 3200);
  }

  function openTeacherCertificate(targetAmount) {
    const keeper = (typeof Game !== 'undefined') ? Game.getKeeperName() : '별의 파수꾼';
    const state = (typeof Game !== 'undefined') ? Game.state : null;
    const currentGold = state ? state.gold : 0;
    const highestStage = (state && typeof state.highest === 'number') ? (state.highest + 1) : 1;
    const log = (typeof Game !== 'undefined') ? Game.teacherLog().slice().reverse() : [];
    const recentSum = log.reduce(function (s, r) { return s + (r.amount || 0); }, 0);
    
    // 🔥 최대 20,000 미소 절대 상한 강제 적용!
    const rawClaim = targetAmount || (recentSum > 0 ? recentSum : currentGold);
    const claimAmount = Math.max(0, Math.min(20000, Math.floor(Number(rawClaim) || 0)));

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const dateStr = yyyy + '. ' + mm + '. ' + dd + ' ' + hh + ':' + min;
    const dateYMD = yyyy + mm + dd;

    // 🔥 학생들의 텍스트/화면 위조를 원천 차단하는 교사용 암호화 체크섬 (이름+날짜+금액 연동)
    function computeChecksum(name, date, amt) {
      const str = 'LMN2026_SHIELD_' + name + '_' + date + '_' + amt;
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return ('000000' + (h >>> 0).toString(16).toUpperCase()).slice(-6);
    }
    const signHex = computeChecksum(keeper, dateYMD, claimAmount);
    const verifyCode = 'LMN-' + dateYMD + '-' + signHex;

    const copyText = 
      '📜 [루멘티아: 별의 파수꾼] 미소 보상 지급 청구서\n\n' +
      '선생님, 안녕하세요! ✨\n' +
      '별의 파수꾼 [' + keeper + '] 학생이 루멘티아 별길을 성실하게 탐험하여 정직하게 미소를 모았습니다.\n' +
      '약속하신 미소 보상을 파수꾼에게 기쁜 마음으로 지급해 주세요!\n\n' +
      '⭐ 파수꾼 성명: ' + keeper + '\n' +
      '⭐ 청구 미소: +' + fmt(claimAmount) + ' 미소\n' +
      '⭐ 현재 보유: ' + fmt(currentGold) + ' 미소\n' +
      '⭐ 최고 도달: 제 ' + highestStage + ' 성좌\n' +
      '⭐ 발급 일시: ' + dateStr + '\n' +
      '⭐ 인증 번호: ' + verifyCode + '\n\n' +
      '"정직하고 착하게 모은 미소를 칭찬과 함께 선물해 주세요!"\n' +
      '👉 루멘티아 바로가기: https://lumentia.vercel.app';

    const m = modal(
      '<div class="cert-modal">' +
        '<div class="cert-card">' +
          '<div class="cert-ornament top-left"></div>' +
          '<div class="cert-ornament top-right"></div>' +
          '<div class="cert-ornament btm-left"></div>' +
          '<div class="cert-ornament btm-right"></div>' +

          '<div class="cert-header">' +
            '<div class="cert-seal">' +
              '<svg viewBox="0 0 32 32" width="34" height="34" aria-hidden="true">' +
                '<defs><linearGradient id="cgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe7a8"/><stop offset="1" stop-color="#8fdcff"/></linearGradient></defs>' +
                '<path d="M16 2l3.4 9.4L29 16l-9.6 4.6L16 30l-3.4-9.4L3 16l9.6-4.6z" fill="url(#cgrad)"/>' +
                '<circle cx="16" cy="16" r="2.2" fill="#0c1328"/>' +
              '</svg>' +
            '</div>' +
            '<p class="cert-subtitle">LUMENTIA REWARD VOUCHER</p>' +
            '<h2 class="cert-title">별빛 미소 지급 청구 인증서</h2>' +
          '</div>' +

          '<div class="cert-body">' +
            '<div class="cert-to"><span>수신:</span> <b>존경하는 선생님 귀하</b></div>' +
            '<p class="cert-desc">' +
              '위 파수꾼은 루멘티아의 별길을 성실하게 탐험하여 안개를 걷어내고 정직하게 미소를 획득하였음을 공식 증명합니다.<br>' +
              '선생님, 파수꾼이 약속을 지키며 모은 미소 보상을 기쁜 마음으로 지급해 주실 것을 정중히 청구합니다!' +
            '</p>' +

            '<div class="cert-grid">' +
              '<div class="cert-stat-box highlight">' +
                '<span class="stat-label">청구 미소</span>' +
                '<b class="stat-val gold">+' + fmt(claimAmount) + ' <i class="unit">미소</i></b>' +
              '</div>' +
              '<div class="cert-stat-box">' +
                '<span class="stat-label">파수꾼(학생)</span>' +
                '<b class="stat-val keeper-name">' + keeper + '</b>' +
              '</div>' +
              '<div class="cert-stat-box">' +
                '<span class="stat-label">도달 성좌</span>' +
                '<b class="stat-val">제 ' + highestStage + ' 성좌</b>' +
              '</div>' +
              '<div class="cert-stat-box">' +
                '<span class="stat-label">현재 누적</span>' +
                '<b class="stat-val">' + fmt(currentGold) + ' 미소</b>' +
              '</div>' +
            '</div>' +

            '<div class="cert-footer-meta">' +
              '<div class="cert-meta-col">' +
                '<span>발급 일시: ' + dateStr + '</span>' +
                '<span>인증 코드: <b class="code">' + verifyCode + '</b></span>' +
              '</div>' +
              '<div class="cert-stamp-wrap">' +
                '<div class="cert-stamp">' +
                  '<span>공식인증</span>' +
                  '<b>루멘티아</b>' +
                  '<span>별빛수호</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="cert-actions">' +
          '<button type="button" class="btn-primary cert-copy-btn" id="btn-cert-copy">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>' +
              '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>' +
            '</svg>' +
            '📋 카톡 · 문자용 인증서 복사하기' +
          '</button>' +
          '<div class="cert-sub-actions">' +
            '<button type="button" class="btn-ghost" id="btn-open-log-from-cert">상세 획득 기록</button>' +
            '<button type="button" class="btn-ghost" data-close>닫기</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );

    const copyBtn = m.querySelector('#btn-cert-copy');
    if (copyBtn) copyBtn.dataset.copyText = copyText;

    copyBtn.addEventListener('click', function () {
      SFX.play('claim');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyText).then(function () {
          toast('선생님께 드릴 미소 인증서가 복사되었습니다! 카톡이나 문자로 보내세요.');
        }).catch(function () {
          prompt('아래 인증서 전문을 복사하세요:', copyText);
        });
      } else {
        prompt('아래 인증서 전문을 복사하세요:', copyText);
      }
    });

    m.querySelector('#btn-open-log-from-cert').addEventListener('click', function () {
      SFX.play('click');
      closeModal();
      openTeacherLog();
    });
  }

  function openTeacherLog() {
    const log = Game.teacherLog().slice().reverse();
    const total = log.reduce(function (s, r) { return s + r.amount; }, 0);
    const rows = log.length
      ? log.map(function (r) {
          const d = new Date(r.t);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          const ss = String(d.getSeconds()).padStart(2, '0');
          return '<div class="report-row">' +
            '<span class="report-time">' + hh + ':' + mm + ':' + ss + '</span>' +
            '<span class="report-label">' + r.label + '</span>' +
            '<b>+' + fmt(r.amount) + '미소</b>' +
          '</div>';
        }).join('')
      : '<div class="report-empty">아직 받은 미소가 없습니다.</div>';
    const m = modal(
      '<div class="modal-head"><div><p class="eyebrow">SMILE RECORD</p><h2>받은 미소 기록</h2>' +
        '<p>선생님께 드릴 미소 내역을 확인합니다.</p></div>' +
        '<button class="modal-x" data-close aria-label="닫기">×</button></div>' +
      '<button type="button" class="btn-line" id="btn-open-cert-from-log" style="width:100%;margin-bottom:12px;height:40px;font-size:12.5px;">📜 선생님께 제출할 인증서 발급하기 →</button>' +
      '<div class="report-sum"><span>최근 받은 미소</span><b>' + fmt(total) + '<i>미소</i></b></div>' +
      '<div class="report-list">' + rows + '</div>' +
      '<div class="info-note">미소를 받으면 <b>‘획득한 미소를 선생님에게 알려주세요’</b> 안내가 화면에 표시됩니다.<br>1회 보상은 최대 20,000미소를 넘지 않습니다.</div>' +
      '<button class="btn-primary" data-close style="margin-top:14px">확인</button>'
    );

    m.querySelector('#btn-open-cert-from-log').addEventListener('click', function () {
      SFX.play('click');
      closeModal();
      openTeacherCertificate();
    });
  }

  function openGuide() {
    modal(
      '<div class="modal-head"><div><p class="eyebrow">HOW TO PLAY</p><h2>게임 방법 & 별길 가이드</h2></div>' +
        '<button class="modal-x" data-close aria-label="닫기">×</button></div>' +
      '<div class="guide-list">' +
        '<div class="guide-item" style="border: 1px solid rgba(255, 212, 121, .35); background: rgba(255, 212, 121, .06);">' +
          '<span class="guide-num" style="color:var(--gold);">★</span>' +
          '<div><b style="color:var(--gold); font-size:12px;">핵심 플레이 3단계 법칙</b>' +
          '<p style="color:#fff; line-height:1.6;">① <b>전투 & 미소 수집:</b> 동행들이 자동으로 적을 물리치며 미소와 별빛을 획득합니다.<br>' +
          '② <b>동행 성장 & 소환:</b> 미소로 [영웅] 레벨을 올리고, [소환]에서 첫 10회 무료 소환으로 새 동행을 맞이하세요.<br>' +
          '③ <b>궁극기 폭발:</b> 게이지가 차면 오른쪽 아래 [별자리 합주]를 눌러 보스를 시원하게 돌파하세요!</p></div>' +
        '</div>' +
        '<div class="guide-item"><span class="guide-num">1</span><div><b>실시간 여정 안내 배너</b>' +
          '<p>화면 상단에 항상 표시되는 <b>[여정 안내 배너]</b>와 골드빛으로 깜빡이는 탭 버튼이 지금 당장 해야 할 최고의 행동을 친절하게 이끌어줍니다.</p></div></div>' +
        '<div class="guide-item"><span class="guide-num">2</span><div><b>자동 산책 & 전투</b><p>동행들은 스스로 별빛을 보태 안개를 걷어냅니다. 길을 밝히면 다음 별길로 이어집니다.</p></div></div>' +
        '<div class="guide-item"><span class="guide-num">3</span><div><b>동행 성장 & 각성</b><p>미소로 동행의 레벨을 키우고, 같은 동행의 조각으로 각성하세요. 각성 시 스탯과 레벨 상한이 폭증합니다.</p></div></div>' +
        '<div class="guide-item"><span class="guide-num">4</span><div><b>별의 소환 & 3인 편성</b><p>별빛으로 새로운 동행을 소환하세요. 획득한 동행은 [영웅] 탭 상단 슬롯에서 3인 파티로 편성할 수 있습니다.</p></div></div>' +
        '<div class="guide-item"><span class="guide-num">5</span><div><b>오프라인 방치 수급</b><p>게임을 종료해도 최고 스테이지 기준으로 미소가 자동 누적됩니다. (최대 8시간)</p></div></div>' +
        '<div class="guide-item"><span class="guide-num">6</span><div><b>보상 규정 & 난도</b><p>미소를 받으면 ‘획득한 미소를 선생님에게 알려주세요’ 안내가 표시됩니다. 1회 보상은 최대 20,000미소 상한이며, 스테이지 13부터 안개가 짙어집니다.</p></div></div>' +
      '</div>' +
      '<div class="info-note">세계관 · 캐릭터 · 일러스트 · 음향은 모두 이 게임을 위해 새로 만든 오리지널 요소입니다.</div>' +
      '<button class="btn-primary" data-close style="margin-top:14px">모험 시작하기</button>'
    );
  }

  function openRates() {
    const total = HEROES.length;
    const count = function (r) { return HEROES.filter(function (h) { return h.rarity === r; }).length; };
    modal(
      '<div class="modal-head"><div><p class="eyebrow">PROBABILITY</p><h2>소환 확률 안내</h2></div>' +
        '<button class="modal-x" data-close aria-label="닫기">×</button></div>' +
      '<div class="rate-table">' +
        '<div class="rate-row"><b style="color:var(--ssr)">SSR · 성좌의 현신</b><span>' + (GACHA.rates.SSR * 100).toFixed(2) + '% · ' + count('SSR') + '종</span></div>' +
        '<div class="rate-row"><b style="color:var(--sr)">SR · 별의 계승자</b><span>' + (GACHA.rates.SR * 100).toFixed(2) + '% · ' + count('SR') + '종</span></div>' +
        '<div class="rate-row"><b style="color:var(--r)">R · 별의 조각</b><span>' + (GACHA.rates.R * 100).toFixed(2) + '% · ' + count('R') + '종</span></div>' +
        '<div class="rate-row"><b>전체 영웅</b><span>' + total + '종</span></div>' +
      '</div>' +
      '<p class="rate-note">· 각 소환은 독립적으로 확률이 적용됩니다.<br>' +
        '· 10회 소환 시 SR 이상 영웅 1명이 확정됩니다.<br>' +
        '· SSR 영웅이 나오지 않은 소환이 60회에 도달하면 다음 SSR이 확정됩니다.<br>' +
        '· 보유 중인 영웅이 중복으로 등장하면 해당 영웅의 조각으로 변환됩니다.<br>' +
        '· 본 게임은 실제 결제가 없는 데모로, 별빛은 게임 내에서만 획득할 수 있습니다.</p>' +
      '<button class="btn-primary" data-close style="margin-top:14px">확인</button>'
    );
  }

  function openSettings() {
    const sfxOn = SFX.isSfxEnabled();
    const bgmOn = SFX.isBgmEnabled();
    const m = modal(
      '<div class="modal-head"><div><p class="eyebrow">SETTINGS</p><h2>설정</h2></div>' +
        '<button class="modal-x" data-close aria-label="닫기">×</button></div>' +
      '<div class="setting-row">' +
        '<div><b>배경음악 (BGM)</b><p>몽환적인 우주 판타지 앰비언트 음악을 재생합니다.</p></div>' +
        '<button class="toggle ' + (bgmOn ? 'on' : '') + '" id="toggle-bgm" aria-label="배경음악 토글"></button>' +
      '</div>' +
      '<div class="setting-row">' +
        '<div><b>타격 효과음 (SFX)</b><p>전투 타격음, 스킬, 궁극기 효과음을 재생합니다.</p></div>' +
        '<button class="toggle ' + (sfxOn ? 'on' : '') + '" id="toggle-sfx" aria-label="효과음 토글"></button>' +
      '</div>' +
      '<div class="setting-row account-row">' +
        '<div><b>파수꾼 계정</b><p>현재 접속: <span class="keeper-pill">' + (typeof Game !== 'undefined' ? Game.getKeeperName() : '별의 파수꾼') + '</span></p></div>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="btn-line" id="btn-copy-transfer" style="width:auto;height:34px;padding:0 10px;font-size:11px;margin:0">인수인계 코드</button>' +
          '<button class="btn-ghost" id="btn-logout" style="width:auto;height:34px;padding:0 10px;font-size:11px">계정 전환</button>' +
        '</div>' +
      '</div>' +
      '<div class="setting-row">' +
        '<div><b>선생님 미소 청구 인증서</b><p>선생님께 보상 미소를 달라고 청구하는 공식 인증서를 발급합니다.</p></div>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="btn-primary" id="open-cert" style="width:auto;height:34px;padding:0 12px;font-size:11.5px">인증서</button>' +
          '<button class="btn-ghost" id="open-report" style="width:auto;height:34px;padding:0 10px;font-size:11px">기록</button>' +
        '</div>' +
      '</div>' +
      '<div class="setting-row">' +
        '<div><b>게임 안내</b><p>별길, 성장, 소환 방법을 확인합니다.</p></div>' +
        '<button class="btn-ghost" id="open-guide" style="width:auto;height:32px;padding:0 12px;font-size:10.5px">열기</button>' +
      '</div>' +
      '<div class="info-note">루멘티아 : 별의 파수꾼<br>' +
        '미소를 받으면 ‘획득한 미소를 선생님에게 알려주세요’ 안내가 표시됩니다. 1회 보상은 최대 20,000미소입니다.<br>' +
        '이 게임의 세계관, 캐릭터, 이름, 일러스트, 음향은 모두 창작된 오리지널 요소이며, 특정 작품의 코드 · 이미지 · 캐릭터를 사용하지 않았습니다.<br><br>' +
        '진행도는 이 브라우저에 자동 저장됩니다.</div>' +
      '<div class="setting-actions">' +
        '<button class="btn-danger" id="btn-reset">저장 초기화</button>' +
        '<button class="btn-ghost" data-close>닫기</button>' +
      '</div>'
    );

    m.querySelector('#toggle-bgm').addEventListener('click', function () {
      const next = !SFX.isBgmEnabled();
      SFX.setBgm(next);
      this.classList.toggle('on', next);
      if (next) SFX.play('click');
    });
    m.querySelector('#toggle-sfx').addEventListener('click', function () {
      const next = !SFX.isSfxEnabled();
      SFX.setSfx(next);
      Game.setSfx(next);
      this.classList.toggle('on', next);
      if (next) SFX.play('click');
    });
    m.querySelector('#open-cert').addEventListener('click', function () {
      SFX.play('click');
      openTeacherCertificate();
    });
    m.querySelector('#open-report').addEventListener('click', openTeacherLog);
    m.querySelector('#open-guide').addEventListener('click', openGuide);
    m.querySelector('#btn-reset').addEventListener('click', openReset);

    const copyBtn = m.querySelector('#btn-copy-transfer');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        SFX.play('click');
        if (typeof Auth === 'undefined') return;
        const res = Auth.exportTransferCode();
        if (res.ok) {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(res.code).then(function () {
              toast('인수인계 코드가 복사되었습니다! 다른 기기에서 붙여넣으세요.');
            }).catch(function () {
              prompt('아래 인수인계 코드를 복사하세요:', res.code);
            });
          } else {
            prompt('아래 인수인계 코드를 복사하세요:', res.code);
          }
        } else {
          toast(res.error || '코드 생성 실패');
        }
      });
    }

    const logoutBtn = m.querySelector('#btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        SFX.play('click');
        if (confirm('현재 파수꾼 계정에서 로그아웃하고 다른 파수꾼으로 전환하시겠습니까?')) {
          Game.logout();
        }
      });
    }
  }

  function openReset() {
    const m = modal(
      '<div class="modal-head"><div><h2>저장 초기화</h2><p>모든 진행도가 사라집니다.</p></div>' +
        '<button class="modal-x" data-close aria-label="닫기">×</button></div>' +
      '<div class="info-note">보유 영웅, 레벨, 별빛, 최고 스테이지가 모두 초기화됩니다.<br>이 작업은 되돌릴 수 없습니다.</div>' +
      '<div class="btn-row" style="margin-top:14px">' +
        '<button class="btn-ghost" data-close>취소</button>' +
        '<button class="btn-danger" id="confirm-reset">초기화</button>' +
      '</div>'
    );
    m.querySelector('#confirm-reset').addEventListener('click', function () {
      Game.reset();
    });
  }

  function openOffline(info) {
    const m = modal(
      '<div class="offline-art">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/><path d="M17 3.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"/>' +
        '</svg>' +
      '</div>' +
      '<h2 style="text-align:center;font-size:20px;font-weight:800">수호단의 기록</h2>' +
      '<p class="offline-time">' + fmtDuration(info.seconds) + ' 동안 미소가 쌓였습니다</p>' +
      '<div class="offline-reward"><span>획득 미소</span><b><i class="ico ico-gold"></i>' + fmt(info.gold) + '</b></div>' +
      '<p class="offline-cap">1회 최대 20,000미소 · 받은 미소를 선생님께 알려주세요</p>' +
      '<button class="btn-primary" id="claim-offline">보상 받기</button>',
      { sticky: true }
    );
    m.querySelector('#claim-offline').addEventListener('click', function () {
      Game.claimOffline(info);
      SFX.play('coin');
      closeModal();
      refreshAll();
      toast('미소 +' + fmt(info.gold), 'gold');
    });
  }

  function updateKeeperHUD() {
    const el = document.getElementById('hud-keeper-name');
    if (el && typeof Game !== 'undefined') {
      const name = Game.getKeeperName();
      el.textContent = '파수꾼: ' + name;
    }
  }

  function openKeeperGate() {
    closeModal();
    let currentMode = 'register';
    const users = (typeof Auth !== 'undefined') ? Auth.getUsers() : {};
    const userNames = Object.keys(users);

    const m = modal(
      '<div class="keeper-gate">' +
        '<div class="gate-header">' +
          '<div class="gate-mark">' +
            '<svg viewBox="0 0 32 32" width="44" height="44" aria-hidden="true">' +
              '<defs><linearGradient id="gkg" x1="0" y1="0" x2="1" y2="1">' +
                '<stop offset="0" stop-color="#ffe7a8"/>' +
                '<stop offset="1" stop-color="#8fdcff"/>' +
              '</linearGradient></defs>' +
              '<path d="M16 2l3.4 9.4L29 16l-9.6 4.6L16 30l-3.4-9.4L3 16l9.6-4.6z" fill="url(#gkg)"/>' +
              '<circle cx="16" cy="16" r="2.5" fill="#070b18"/>' +
            '</svg>' +
          '</div>' +
          '<h2>파수꾼 관문</h2>' +
          '<p class="gate-sub">이름과 비밀번호로 별빛 여정을 저장하고 언제든 이어서 플레이하세요.</p>' +
        '</div>' +

        '<div class="gate-tabs">' +
          '<button type="button" class="gate-tab active" data-gate-tab="register">신규 파수꾼 등록</button>' +
          '<button type="button" class="gate-tab" data-gate-tab="login">이어서 하기</button>' +
          '<button type="button" class="gate-tab" data-gate-tab="transfer">기기 인수인계</button>' +
        '</div>' +

        '<form id="gate-form" class="gate-form" onsubmit="return false;">' +
          '<div class="gate-field" id="wrap-gate-name">' +
            '<label for="gate-name">파수꾼 이름</label>' +
            '<input type="text" id="gate-name" placeholder="2~12자 (예: 별빛수호자)" maxlength="12" autocomplete="username" spellcheck="false" required />' +
          '</div>' +

          '<div class="gate-field" id="wrap-gate-pass">' +
            '<label for="gate-pass">비밀번호</label>' +
            '<input type="password" id="gate-pass" placeholder="4자리 이상 보안 암호" maxlength="24" autocomplete="current-password" required />' +
          '</div>' +

          '<div class="gate-field" id="wrap-gate-code" style="display:none">' +
            '<label for="gate-code">기기 인수인계 백업 코드</label>' +
            '<textarea id="gate-code" placeholder="이전 기기에서 복사한 LUMEN- 코드를 여기에 붙여넣으세요" rows="3"></textarea>' +
          '</div>' +

          '<div class="gate-error" id="gate-error" style="display:none"></div>' +

          (userNames.length > 0 ? (
            '<div class="gate-existing" id="wrap-gate-existing" style="display:none">' +
              '<span>이 기기에 저장된 파수꾼: </span>' +
              '<div class="user-chip-list">' +
                userNames.map(function (u) {
                  return '<button type="button" class="user-chip" data-name="' + u + '">' + u + '</button>';
                }).join('') +
              '</div>' +
            '</div>'
          ) : '') +

          '<div class="gate-note" id="gate-note">' +
            '✨ 등록한 이름과 비밀번호는 나중에 <b>이어서 하기</b> 시 필요하므로 꼭 기억해주세요!' +
          '</div>' +

          '<div class="gate-actions">' +
            '<button type="submit" class="btn-primary" id="btn-gate-submit">별빛 등록하고 시작</button>' +
          '</div>' +
        '</form>' +
      '</div>',
      { sticky: true }
    );

    const nameInput = m.querySelector('#gate-name');
    const passInput = m.querySelector('#gate-pass');
    const codeInput = m.querySelector('#gate-code');
    const wrapName = m.querySelector('#wrap-gate-name');
    const wrapPass = m.querySelector('#wrap-gate-pass');
    const wrapCode = m.querySelector('#wrap-gate-code');
    const wrapExisting = m.querySelector('#wrap-gate-existing');
    const errorEl = m.querySelector('#gate-error');
    const noteEl = m.querySelector('#gate-note');
    const submitBtn = m.querySelector('#btn-gate-submit');

    function showError(msg) {
      if (!msg) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
      } else {
        errorEl.style.display = 'block';
        errorEl.textContent = msg;
        if (typeof SFX !== 'undefined') SFX.play('click');
      }
    }

    m.querySelectorAll('.gate-tab').forEach(function (tabBtn) {
      tabBtn.addEventListener('click', function () {
        SFX.play('click');
        m.querySelectorAll('.gate-tab').forEach(function (t) { t.classList.remove('active'); });
        tabBtn.classList.add('active');
        currentMode = tabBtn.dataset.gateTab;
        showError('');

        if (currentMode === 'register') {
          wrapName.style.display = 'block';
          wrapPass.style.display = 'block';
          wrapCode.style.display = 'none';
          if (wrapExisting) wrapExisting.style.display = 'none';
          submitBtn.textContent = '별빛 등록하고 시작';
          noteEl.innerHTML = '✨ 등록한 이름과 비밀번호는 나중에 <b>이어서 하기</b> 시 필요하므로 꼭 기억해주세요!';
        } else if (currentMode === 'login') {
          wrapName.style.display = 'block';
          wrapPass.style.display = 'block';
          wrapCode.style.display = 'none';
          if (wrapExisting) wrapExisting.style.display = 'block';
          submitBtn.textContent = '기록 불러와 이어서 하기';
          noteEl.innerHTML = '🌟 등록했던 파수꾼 이름과 비밀번호를 입력하면 기존 진행 상황이 복원됩니다.';
        } else if (currentMode === 'transfer') {
          wrapName.style.display = 'none';
          wrapPass.style.display = 'none';
          wrapCode.style.display = 'block';
          if (wrapExisting) wrapExisting.style.display = 'none';
          submitBtn.textContent = '데이터 복원 및 로그인';
          noteEl.innerHTML = '📲 다른 스마트폰이나 PC의 설정 메뉴에서 발급받은 인수인계 코드를 붙여넣으세요.';
        }
      });
    });

    m.querySelectorAll('.user-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        SFX.play('click');
        nameInput.value = this.dataset.name;
        passInput.focus();
      });
    });

    m.querySelector('#gate-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      showError('');

      if (currentMode === 'register') {
        const name = nameInput.value.trim();
        const pass = passInput.value.trim();
        const res = await Auth.register(name, pass);
        if (!res.ok) {
          showError(res.error);
          return;
        }
        SFX.init();
        SFX.play('levelup');
        closeModal();
        toast(res.name + ' 파수꾼님, 환영합니다!');
        Game.reloadFromAuth();
      } else if (currentMode === 'login') {
        const name = nameInput.value.trim();
        const pass = passInput.value.trim();
        const res = await Auth.login(name, pass);
        if (!res.ok) {
          showError(res.error);
          return;
        }
        SFX.init();
        SFX.play('levelup');
        closeModal();
        toast('어서오세요, ' + res.name + ' 파수꾼님! 별빛을 이어갑니다.');
        Game.reloadFromAuth();
      } else if (currentMode === 'transfer') {
        const code = codeInput.value.trim();
        const pass = passInput.value.trim();
        const res = await Auth.importTransferCode(code, pass);
        if (!res.ok) {
          showError(res.error);
          return;
        }
        SFX.init();
        SFX.play('ascend');
        closeModal();
        toast('기기 인수인계 성공! ' + res.name + ' 파수꾼님, 환영합니다!');
        Game.reloadFromAuth();
      }
    });
  }

  function openWelcome() {
    const m = modal(
      '<div class="welcome">' +
        '<div class="welcome-body">' +
          '<svg class="welcome-mark" viewBox="0 0 64 64" aria-hidden="true">' +
            '<defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1">' +
              '<stop offset="0" stop-color="#ffe7a8"/><stop offset="1" stop-color="#8fdcff"/>' +
            '</linearGradient></defs>' +
            '<circle cx="32" cy="32" r="27" fill="none" stroke="rgba(255,212,121,.22)"/>' +
            '<circle cx="32" cy="32" r="21" fill="none" stroke="rgba(143,220,255,.18)" stroke-dasharray="3 7"/>' +
            '<path d="M32 7l6.2 18.8L57 32l-18.8 6.2L32 57l-6.2-18.8L7 32l18.8-6.2z" fill="url(#wg)"/>' +
            '<circle cx="32" cy="32" r="3.4" fill="#060a16"/>' +
          '</svg>' +
          '<p class="eyebrow">A NEW CONSTELLATION</p>' +
          '<h2>루멘티아</h2>' +
          '<p class="welcome-tagline">별의 파수꾼</p>' +
          '<p class="welcome-sub">안개가 별빛을 하나씩 가리는 세계.<br>이름을 이어받은 파수꾼들과 다시 별길을 밝힙니다.</p>' +
          '<div class="welcome-howto">' +
            '<div class="howto-head"><b>이렇게 즐겨요</b><span>HOW TO PLAY</span></div>' +
            '<ol class="howto-list">' +
              '<li class="howto-item"><span class="howto-no">01</span><div><b>자동 산책</b><p>동행들이 스스로 안개를 걷어내며 다음 별길을 엽니다.</p></div></li>' +
              '<li class="howto-item"><span class="howto-no">02</span><div><b>함께 성장</b><p>미소로 레벨을 올리고, 같은 동행의 조각으로 각성합니다.</p></div></li>' +
              '<li class="howto-item"><span class="howto-no">03</span><div><b>별의 인연</b><p>별빛으로 새 동행을 만납니다. 첫 10회 소환은 무료입니다.</p></div></li>' +
              '<li class="howto-item"><span class="howto-no">04</span><div><b>별자리 합주</b><p>게이지가 차면 오른쪽 아래 버튼으로 모두의 빛을 모읍니다.</p></div></li>' +
            '</ol>' +
            '<p class="howto-foot">자리를 비운 사이에도 미소가 쌓입니다 · 최대 8시간<br>미소를 받으면 선생님께 알려주세요 안내가 떠요<br>1회 최대 20,000미소 · 13 스테이지부터 안개가 짙어져요<br>전투 화면 왼쪽 아래 <b>게임 방법</b>에서 다시 볼 수 있어요.</p>' +
          '</div>' +
        '</div>' +
        '<div class="welcome-foot">' +
          '<button class="btn-primary" id="welcome-start">여정 시작</button>' +
        '</div>' +
      '</div>',
      { sticky: true }
    );
    m.querySelector('#welcome-start').addEventListener('click', function () {
      SFX.init();
      SFX.play('click');
      closeModal();
      Game.startJourney();
    });
  }

  /* ---------------- banner / toast ---------------- */

  function showBanner(title, sub, kind) {
    if (!els.banner) return;
    els.banner.className = 'stage-banner' + (kind === 'bad' ? ' bad' : '');
    els.banner.innerHTML = '<b>' + title + '</b>' + (sub ? '<small>' + sub + '</small>' : '');
    void els.banner.offsetWidth;
    els.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () {
      els.banner.classList.remove('show');
    }, 1750);
  }

  function toast(message, kind) {
    if (!els.toasts) return;
    const node = document.createElement('div');
    node.className = 'toast' + (kind ? ' ' + kind : '');
    node.textContent = message;
    els.toasts.appendChild(node);
    while (els.toasts.children.length > 3) els.toasts.removeChild(els.toasts.firstChild);
    setTimeout(function () {
      node.classList.add('out');
      setTimeout(function () { node.remove(); }, 320);
    }, 2300);
  }

  /* ---------------- refresh ---------------- */

  function renderAll() {
    renderHUD();
    renderParty();
    renderHeroes();
    renderSummon();
    renderMissions();
  }

  function refreshAll() {
    renderHUD();
    renderParty();
    renderHeroes();
    renderSummon();
    renderMissions();
    updatePower();
  }

  return {
    init: init,
    showTab: showTab,
    setStage: setStage,
    updatePower: updatePower,
    renderHUD: renderHUD,
    renderParty: renderParty,
    renderHeroes: renderHeroes,
    renderMissions: renderMissions,
    updatePartyHp: updatePartyHp,
    updateUltPct: updateUltPct,
    showBanner: showBanner,
    toast: toast,
    openHero: openHero,
    openGuide: openGuide,
    openSettings: openSettings,
    openRates: openRates,
    openOffline: openOffline,
    openWelcome: openWelcome,
    openKeeperGate: openKeeperGate,
    updateKeeperHUD: updateKeeperHUD,
    openTeacherLog: openTeacherLog,
    openTeacherCertificate: openTeacherCertificate,
    renderChallengePot: renderChallengePot,
    updateDailyBadge: updateDailyBadge,
    openDailyLimitModal: openDailyLimitModal,
    showTeacherReport: showTeacherReport,
    closeModal: closeModal,
    refreshAll: refreshAll,
    refreshGrowthUI: refreshGrowthUI
  };
})();

window.UI = UI;
