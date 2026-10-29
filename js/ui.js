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
  let modalOnClose = null;
  let modalDismissible = true;
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

  function escapeHTML(value) { return String(value).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
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
    els.growthEarned = el('growth-daily-earned');
    els.growthNote = el('growth-daily-note');
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
    els.startChallenge = el('btn-start-challenge');
    els.dailyReward = el('daily-reward-total');
    els.challengeStatus = el('challenge-status');
    els.startChallenge.addEventListener('click', async function () {
      els.startChallenge.disabled = true;
      try { SFX.init(); await Game.startChallenge(); }
      catch (e) { toast('도전을 시작하지 못했습니다. 새로고침 후 다시 시도하세요.', 'bad'); }
      renderHUD();
    });

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
        if (step.target === 'cert') { openTeacherCertificate(step.date); return; }
        if (step.target === 'records') { openTeacherLog(); return; }
        if (step.tab) showTab(step.tab);
        if (step.target === 'ult') Battle.castUltimate();
        else if (step.focus) {
          const button = el(step.focus);
          if (button && !button.disabled) button.click();
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
    el('btn-student-logout').addEventListener('click', openStudentLogout);
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
        if (!Game.save()) return;
        Battle.pause();
        const m = modal('<div class="modal-head"><h2>수령하고 도전을 마칠까요?</h2></div>' +
          '<p class="info-note">금고 ' + fmt(pot) + '포인트를 보상 미소로 확정합니다.<br>성장 미소는 유지되며, 확정 보상의 인증서는 72시간 안에 선생님 클래스톡으로 보내야 효력이 생깁니다.</p>' +
          '<div class="btn-row"><button class="btn-primary" id="confirm-cashout">수령하고 종료</button><button class="btn-ghost" data-close>계속 도전</button></div>', {
            onClose: function () { if (Game.state.run && Game.state.run.status === 'active') Battle.start(); }
          });
        m.querySelector('#confirm-cashout').addEventListener('click', function () { Game.cashoutChallengePot(); });
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
        if (result.reason) toast(result.reason, 'bad');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalDismissible) closeModal();
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
    const growth = Game.growthStatus();
    setText(els.growthEarned, fmt(growth.earned) + ' / ' + fmt(growth.limit));
    setText(els.growthNote, growth.remaining > 0 ? '오늘 남은 획득 한도 ' + fmt(growth.remaining) : '오늘 획득 완료 · 한국 시간 자정에 초기화');
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
    if (!els.potAmount || !Game.state) return;
    const run = Game.state.run;
    const active = !!run && run.status === 'active';
    const pot = Game.getChallengePot();
    const daily = Game.checkDailyPlays();
    setText(els.potAmount, fmt(pot) + ' P');
    setText(els.dailyReward, fmt(Game.getDailyRewardClaimed()));
    els.btnCashout.disabled = !active;
    els.potDangerTag.hidden = !active || !Game.getDifficultyMultiplier().isHard;
    els.potBar.classList.toggle('danger', active && Game.getDifficultyMultiplier().isHard);
    els.potBar.classList.toggle('has-pot', active);
    els.startChallenge.hidden = active;
    els.startChallenge.disabled = !daily.canPlay;
    setText(els.startChallenge, daily.canPlay ? '도전 시작 · ' + daily.available + '회 남음' : '오늘의 도전 완료');
    const runDateNote = active && run.date !== Game.today() ? ' · ' + run.date + ' 시작분' : '';
    setText(els.challengeStatus, active ? '도전 중 · 금고는 수령해야 확정됩니다' + runDateNote : '하루 2회 · 수령 또는 패배 시 종료 · 미청구 보상은 72시간 후 만료');
    if (els.ultBtn) els.ultBtn.disabled = !active;
    updateDailyBadge();
  }

  function updateDailyBadge() {
    if (!els.dailyBadge || typeof Game === 'undefined') return;
    const daily = Game.checkDailyPlays();
    setText(els.dailyBadge, '도전: ' + daily.available + '/2');
    els.dailyBadge.classList.toggle('empty', daily.available === 0);
  }

  function openDailyLimitModal() {
    modal('<div class="modal-head"><h2>오늘의 도전 완료</h2><button data-close class="modal-x" aria-label="닫기">×</button></div>' +
      '<p class="info-note">하루 2회 도전을 모두 사용했습니다. 한국 시간 자정에 새 도전 기회가 생깁니다.<br>오늘 누적 보상: ' + fmt(Game.getDailyRewardClaimed()) + ' / 20,000미소</p>' +
      '<button class="btn-primary" id="btn-daily-open-cert">보상 기록과 청구서</button>');
    el('btn-daily-open-cert').addEventListener('click', function () { openTeacherCertificate(); });
  }

  function updateGuideBanner() {
    if (!els.guideBanner || !window.Game || !Game.getGuideStep) return;
    const step = Game.getGuideStep();
    if (!step) return;

    if (els.guideTitle) setText(els.guideTitle, step.title);
    if (els.guideDesc) setText(els.guideDesc, step.desc);
    if (els.guideActionBtn) setText(els.guideActionBtn, step.action || '확인');
    document.querySelectorAll('.tutorial-focus').forEach(function (node) { node.classList.remove('tutorial-focus'); });
    if (step.focus && el(step.focus)) el(step.focus).classList.add('tutorial-focus');

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
    setText(els.income, Game.growthStatus().remaining > 0 ? '+' + fmt(Math.floor(rate)) + ' /초' : '오늘 성장 획득 완료');
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
    modalOnClose = opts.onClose || null;
    modalDismissible = !opts.sticky;
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
    const callback = modalOnClose;
    modalOnClose = null;
    modalDismissible = true;
    if (callback) callback();
  }

  /* ---------------- teacher report ---------------- */

  function showTeacherReport(amount) {
    toast('청구 보상 +' + fmt(amount) + '미소 확정 · 72시간 안에 청구하세요', 'gold');
  }
  function formatKST(timestamp) {
    return new Intl.DateTimeFormat('ko-KR', {timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).format(new Date(timestamp));
  }
  function openChallengeResult(run) {
    const success = run.status === 'cashed_out';
    const total = Game.getDailyRewardClaimed(run.date);
    const m = modal('<div class="modal-head"><div><p class="eyebrow">CHALLENGE RESULT</p><h2>도전 종료 · ' + (success ? '안전 수령' : '도전 실패') + '</h2></div></div>' +
      '<div class="result-grid">' +
      '<div><span>이번 도전 성장 미소</span><b>+' + fmt(run.growth) + '</b><small>영웅 육성 지갑에 보관</small></div>' +
      '<div><span>' + (success ? '확정 보상 미소' : '잃은 금고 포인트') + '</span><b>' + fmt(success ? run.amount : run.lost) + (success ? ' 미소' : ' P') + '</b><small>' + (success ? (run.amount > 0 ? '미청구 시 ' + formatKST(run.endedAt + Challenge.CLAIM_TTL) + ' 만료' : '이번 도전의 청구 보상은 없습니다') : '성장 미소와 영웅은 유지됩니다') + '</small></div></div>' +
      '<p class="info-note">보상 기준일: ' + run.date + ' · 누적 ' + fmt(total) + ' / 20,000미소<br>완료한 스테이지: ' + run.cleared + ' · 오늘 남은 도전: ' + Game.checkDailyPlays().available + '/2</p>' +
      (success && run.amount > 0 ? '<p class="classtalk-required"><b>인증서를 선생님 클래스톡으로 보내야 효력이 발생합니다.</b><br>복사·저장만으로는 제출되지 않습니다. 72시간 안에 보내주세요.</p>' : '') +
      '<div class="btn-row"><button class="btn-primary" id="result-certificate">청구 보상 확인</button><button class="btn-ghost" data-close>닫기</button></div>');
    m.querySelector('#result-certificate').addEventListener('click', function () { openTeacherCertificate(run.date); });
  }
  function openSyncNotice() {
    const m = modal('<div class="modal-head"><h2>다른 탭에서 여정을 이어가고 있어요</h2></div>' +
      '<p class="info-note">기록이 겹치지 않도록 이 탭을 멈췄습니다. 다른 게임 탭을 닫은 뒤 여기서 이어서 진행하세요.</p>' +
      '<button class="btn-primary" id="resume-this-tab">이 탭에서 이어서 진행</button>' +
      '<div class="gate-teacher-footer"><a href="/teacher" class="teacher-quiet-link">선생님 관리</a></div>', {sticky: true});
    m.querySelector('#resume-this-tab').addEventListener('click', function () { closeModal(); Game.reloadFromAuth(); });
  }
  function openBalanceAdjustment(info, onConfirm) {
    const before = Number(info.before).toLocaleString('ko-KR');
    const after = Number(info.after).toLocaleString('ko-KR');
    const m = modal('<div class="modal-head"><div><p class="eyebrow">성장 미소 기준 변경</p><h2>기존 미소 보정 안내</h2></div></div>' +
      '<p class="info-note">' + (info.before > info.after ? '이전 버전에서 한도 없이 쌓인 성장 미소를 새 기준에 맞춰 보정했습니다.' : '보유 금액은 그대로 유지됩니다. 성장 미소의 하루 획득 한도가 적용됩니다.') + '</p>' +
      '<div class="adjustment-amounts"><div><span>보정 전 보유 성장 미소</span><b id="adjustment-before">' + before + '</b></div><div><span>보정 후 보유 성장 미소</span><b id="adjustment-after">' + after + '</b></div></div>' +
      '<p class="info-note">영웅·레벨·각성·조각·최고 스테이지·성장 기록은 유지했습니다.<br>보정 전 원본 기록도 이 브라우저에 백업했습니다.</p>' +
      '<p class="info-note">성장 미소는 처치·클리어·임무·자동 수익·휴식 보상을 모두 합쳐 하루 최대 20,000까지만 얻을 수 있습니다.<br>미소를 사용해도 오늘의 획득 한도는 늘어나지 않습니다.<br>적용일에는 보정 후 금액을 오늘 획득 집계의 시작값으로 반영하며, 한국 시간 자정에 새 한도가 시작됩니다.<br>선생님께 청구할 보상은 별도로 계산합니다.</p>' +
      '<button class="btn-primary" id="acknowledge-adjustment">확인하고 계속하기</button>', {sticky: true});
    m.querySelector('#acknowledge-adjustment').addEventListener('click', onConfirm);
  }
  function openTeacherCertificate(date, skipSync) {
    date = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : Game.today();
    const keeper = Game.getKeeperName();
    const rows = Game.teacherLog(date);
    const total = Math.min(20000, rows.reduce(function(sum,r){return sum + (r.ledgerAmount == null ? r.amount + (r.expiredAmount || 0) : r.ledgerAmount);},0));
    const outstanding = function(r){return r.outstanding == null ? r.amount : r.outstanding;};
    const pending = rows.filter(function(r){return outstanding(r)>0 && !r.receivedAt;});
    const unreported = pending.filter(function(r){return !r.claimedAt && r.ledgerStatus!=='requested';});
    const submissionIds = unreported.map(function(r){return r.id;});
    const pendingTotal = pending.reduce(function(sum,r){return sum+outstanding(r);},0);
    const unpaidTotal = rows.reduce(function(sum,r){return sum+outstanding(r);},0);
    const already = rows.reduce(function(sum,r){return sum+(r.paidAmount || 0);},0);
    const identity = typeof Rewards !== 'undefined' ? Rewards.identity() : null;
    const connection = typeof Rewards !== 'undefined' ? Rewards.status : {connected:false};
    const ids = pending.map(function (r) { return r.id; });
    const deadline = pending.length ? Math.min.apply(null, pending.map(function (r) { return r.t + Challenge.CLAIM_TTL; })) : null;
    const recordRows = rows.map(function (r) {
      let status = '획득 보상 없음 · 0미소';
      if (r.ledgerStatus === 'paid') status = '선생님 지급 완료 · 남은 청구 0미소';
      else if (r.ledgerStatus === 'partial') status = '일부 지급 완료 · 남은 청구 ' + fmt(outstanding(r)) + '미소';
      else if (r.receivedAt) status = '선생님 클래스톡 수신 확인 · 지급 대기';
      else if (r.ledgerStatus === 'expired' || r.expiredAmount) status = '클래스톡 미제출 만료 · 0미소';
      else if (r.outcome === 'failed') status = '도전 실패 · 0미소';
      else if (r.ledgerStatus === 'requested' || r.claimedAt) status = '학생 제출 기록 · 선생님 클래스톡 수신 확인 필요';
      else if (r.amount > 0) status = (r.copiedAt ? '복사됨 · 클래스톡 제출 전 · ' : '클래스톡 미제출 · ') + formatKST(r.t + Challenge.CLAIM_TTL) + ' 만료';
      return '<li><span>' + escapeHTML(r.id) + '</span><b>' + fmt(outstanding(r)) + '미소 남음</b><small>' + status + '</small></li>';
    }).join('') || '<li>이 날짜에 확정된 보상이 없습니다.</li>';
    const copyText = '📜 루멘티아 미소 수령 인증서 · 선생님 클래스톡 제출용\n\n※ 선생님 클래스톡으로 보내야 효력이 발생합니다. 복사·저장만으로는 제출되지 않습니다.\n\n파수꾼: ' + keeper + '\n보상 기준일: ' + date + ' (한국 시간)\n이번 제출 미소: ' + fmt(pendingTotal) +
      '\n학생 번호: ' + (identity ? identity.id.slice(0,8) : '미연결') + '\n해당 날짜 누적 보상: ' + fmt(total) + ' / 20,000미소\n지급 완료 미소: ' + fmt(already) +
      '\n발급 일시: ' + formatKST(Date.now()) + ' (한국 시간)\n제출 기한: ' + (deadline ? formatKST(deadline) : '선생님 수신 확인 완료') + '\n정산 번호: ' + ids.join(', ') + '\n※ 재발급해도 같은 정산 번호는 한 번만 지급합니다. 선생님은 클래스톡 수신 내역과 정산 번호를 확인해 주세요.\nhttps://lumentia.vercel.app';
    const m = modal('<div class="cert-modal"><div class="cert-card">' +
      '<div class="cert-header"><p class="cert-subtitle">선생님 클래스톡 제출용</p><h2 class="cert-title">미소 수령 인증서</h2></div>' +
      '<div class="classtalk-required" role="note"><b>선생님 클래스톡으로 보내야 효력이 발생합니다.</b><p>인증서를 복사하거나 캡처한 뒤, 선생님 클래스톡에 직접 보내주세요. 복사·저장만으로는 제출되지 않습니다.</p></div>' +
      '<div class="cert-body"><div class="cert-to">수신: <b>선생님 귀하</b></div><p class="cert-desc">' + escapeHTML(keeper) + ' · 보상 기준일 ' + date + ' (한국 시간)<br>수령이 끝난 도전의 확정 보상만 표시합니다.</p>' +
      '<div class="cert-grid"><div class="cert-stat-box highlight"><span class="stat-label">해당 날짜 누적 보상 미소</span><b class="stat-val gold" id="cert-daily-total">' + fmt(total) + ' 미소</b><small>하루 합계 최대 20,000미소</small></div>' +
      '<div class="cert-stat-box"><span class="stat-label">남은 청구 보상</span><b class="stat-val" id="cert-pending-total">' + fmt(unpaidTotal) + ' 미소</b><small>미제출 + 수신 확인·지급 대기 금액</small></div>' +
      '<div class="cert-stat-box"><span class="stat-label">선생님 지급 완료</span><b class="stat-val" id="cert-paid-total">' + fmt(already) + ' 미소</b></div>' +
      '<div class="cert-stat-box"><span class="stat-label">미제출 보상 만료</span><b class="cert-deadline">' + (deadline ? formatKST(deadline) + '부터' : '미제출 보상 없음') + '</b><small>수령 확정 후 72시간</small></div></div>' +
      '<p class="info-note">학생 번호: ' + (identity ? escapeHTML(identity.id.slice(0,8)) : '미연결') + '<br>이번 인증서에 담을 미지급 금액: ' + fmt(pendingTotal) + '미소<br>이미 제출했어도 필요하면 같은 인증서를 다시 복사할 수 있어요. 같은 정산 번호는 한 번만 지급돼요.<br><span class="ledger-connection">' + (connection.connected ? '서버 지급 기록 연결됨 · 선생님 지급 확인 시 잔액에 반영' : '서버 지급 기록을 확인하고 있습니다') + '</span></p>' +
      '<ul class="settlement-list">' + recordRows + '</ul>' +
      '<p class="info-note">① 인증서 복사 또는 화면 캡처 → ② 선생님 클래스톡으로 전송 → ③ 아래에 제출 기록<br>72시간 안에 클래스톡으로 보내지 않으면 보상이 만료됩니다.<br>제출 기록 버튼은 자동 전송이나 선생님의 수신 확인을 대신하지 않습니다. 선생님이 수신 확인한 보상은 지급 대기로 보관되고, 지급 완료 금액만큼 청구 잔액이 차감됩니다. 성장 미소와 영웅 기록은 유지됩니다.</p></div></div>' +
      '<div class="cert-actions"><button class="btn-primary cert-copy-btn" id="btn-cert-copy" ' + (pendingTotal ? '' : 'disabled') + '>' + (unreported.length === pending.length ? '1. 클래스톡에 보낼 인증서 복사' : '클래스톡 인증서 다시 복사') + '</button>' +
      '<button class="btn-line" id="btn-record-classtalk" ' + (submissionIds.length ? '' : 'disabled') + '>2. 클래스톡으로 보냈어요 · 제출 기록</button>' +
      '<div class="cert-sub-actions"><button class="btn-ghost" id="btn-refresh-ledger">지급 내역 새로고침</button><button class="btn-ghost" id="btn-open-log-from-cert">날짜별 보상 기록</button><button class="btn-ghost" data-close>닫기</button></div></div></div>');
    m.querySelector('.cert-modal').dataset.rewardDate = date;
    async function refreshLedger() {
      if (typeof Rewards === 'undefined') return;
      const result = await Rewards.sync();
      const visible = document.querySelector('.cert-modal[data-reward-date="' + date + '"]');
      if (!visible) return;
      if (!result.ok) { visible.querySelector('.ledger-connection').textContent = '연결 확인 필요 · 이전 지급 기록 표시 중'; toast(result.error || '지급 기록 연결을 확인해 주세요.'); }
      else if (result.rejected && result.rejected.length) toast('일부 기록은 확인이 필요합니다. 정산 번호를 선생님께 알려주세요.');
    }
    m.querySelector('#btn-refresh-ledger').addEventListener('click', async function(){await refreshLedger();});
    if (!skipSync) refreshLedger();
    const copy = m.querySelector('#btn-cert-copy');
    copy.dataset.copyText = copyText;
    function recordCopy() {
      const ok = Game.recordCertificateCopy(date, ids);
      openTeacherCertificate(date);
      toast(ok ? '인증서를 복사했어요. 선생님 클래스톡에 직접 보내주세요. 같은 정산 번호는 한 번만 지급돼요.' : '보상 상태가 바뀌었습니다. 금액을 다시 확인하세요.');
    }
    copy.addEventListener('click', async function () {
      copy.disabled = true;
      if (typeof Rewards !== 'undefined') { const sync = await Rewards.sync(); if (!sync.ok || (sync.rejected && ids.some(function(id){return sync.rejected.indexOf(id)>=0;}))) {copy.disabled=false;toast('지급 기록 연결과 정산 번호를 확인한 뒤 다시 복사해 주세요.');return;} }
      const fresh = Game.teacherLog(date).filter(function(r){return ids.indexOf(r.id)>=0 && outstanding(r)>0 && !r.receivedAt;});
      if (fresh.length !== pending.length || fresh.reduce(function(n,r){return n+outstanding(r);},0)!==pendingTotal) { openTeacherCertificate(date); toast('보상 상태가 바뀌었습니다. 최신 금액을 확인하세요.'); return; }
      try { await navigator.clipboard.writeText(copyText); recordCopy(); }
      catch (e) {
        const fallback = modal('<div class="modal-head"><h2>인증서를 직접 복사해 주세요</h2></div>' +
          '<p class="info-note">아래 내용을 복사한 뒤 선생님 클래스톡으로 직접 보내야 효력이 발생합니다.</p><textarea class="claim-copy-text" readonly>' + escapeHTML(copyText) + '</textarea>' +
          '<div class="btn-row"><button class="btn-primary" id="manual-copy-complete">복사를 마쳤어요</button><button class="btn-ghost" data-close>취소</button></div>');
        fallback.querySelector('#manual-copy-complete').addEventListener('click', recordCopy);
      }
    });
    m.querySelector('#btn-record-classtalk').addEventListener('click', function () {
      const confirmation = modal('<div class="modal-head"><h2>선생님 클래스톡으로 보냈나요?</h2></div>' +
        '<p class="info-note">실제로 인증서를 클래스톡으로 전송한 경우에만 제출 기록을 남겨주세요.<br>이 버튼은 메시지를 보내지 않으며, 선생님께 도착한 인증서에만 효력이 있습니다.</p>' +
        '<div class="btn-row"><button class="btn-primary" id="confirm-classtalk-submission">보냈어요 · 제출 기록하기</button><button class="btn-ghost" id="cancel-classtalk-submission">아직 보내지 않았어요</button></div>');
      confirmation.querySelector('#cancel-classtalk-submission').addEventListener('click', function () { openTeacherCertificate(date); });
      confirmation.querySelector('#confirm-classtalk-submission').addEventListener('click', function () {
        const ok = Game.recordClassTalkSubmission(date, submissionIds);
        openTeacherCertificate(date);
        toast(ok ? '제출했다고 기록했습니다. 선생님 클래스톡 수신 내역이 효력의 기준입니다.' : '만료되었거나 상태가 바뀌었습니다. 금액을 다시 확인하세요.');
      });
    });
    m.querySelector('#btn-open-log-from-cert').addEventListener('click', openTeacherLog);
  }
  window.addEventListener('lumentia-rewards', function(){
    const visible = document.querySelector('.cert-modal[data-reward-date]');
    if (visible) openTeacherCertificate(visible.dataset.rewardDate, true);
  });
  function openTeacherLog() {
    const dates = Object.keys(Game.state.rewardDays).sort().reverse();
    const rows = dates.map(function (date) {
      const list = Game.teacherLog(date);
      const pending = list.reduce(function(sum,r){return sum+(r.outstanding == null ? r.amount : r.outstanding);},0);
      return '<button class="reward-day btn-line" data-reward-day="' + date + '"><span>' + date + '</span><b>누적 ' + fmt(Game.getDailyRewardClaimed(date)) + ' / 20,000</b><small>미청구 ' + fmt(pending) + '미소</small></button>';
    }).join('');
    const m = modal('<div class="modal-head"><h2>날짜별 청구 보상</h2><button data-close class="modal-x" aria-label="닫기">×</button></div>' +
      '<p class="info-note">지급 완료 금액은 청구 잔액에서 차감됩니다. 72시간 내 클래스톡 미제출 보상은 만료되고, 선생님이 수신 확인한 보상은 지급 대기로 보관됩니다.</p>' + rows + '<button class="btn-primary" data-close>닫기</button>');
    m.querySelectorAll('[data-reward-day]').forEach(function (button) { button.addEventListener('click', function () { openTeacherCertificate(button.dataset.rewardDay); }); });
  }

  function openGuide() {
    modal('<div class="modal-head"><h2>별빛 도전 안내</h2><button class="modal-x" data-close aria-label="닫기">×</button></div>' +
      '<div class="guide-list"><p class="info-note">① 하루 2회, 시작할 때 1회 사용합니다. 매 도전은 스테이지 1부터 시작합니다.<br>' +
      '② 성장 미소는 영웅 육성용이며 모든 경로를 합쳐 하루 최대 20,000미소까지만 획득합니다. 사용해도 오늘 획득 한도는 늘어나지 않습니다. 청구 보상과 별도입니다.<br>' +
      '③ 스테이지를 밝히면 금고 포인트가 쌓입니다. 멈추고 수령하면 보상 미소로 확정되고 도전이 끝납니다.<br>' +
      '④ 패배·75초 시간 초과 시 금고를 잃고 종료합니다. 성장 미소와 영웅 기록은 유지됩니다.<br>' +
      '⑤ 하루 청구 보상은 두 도전 합산 최대 20,000미소입니다. 남은 한도에 도달하면 자동 수령합니다.<br>' +
      '⑥ 오늘 보상 합계 1,000미소 이상을 얻는 구간은 매우 어렵습니다. 위험할 때 금고를 수령하세요.<br>' +
      '⑦ 인증서는 선생님 클래스톡으로 보내야 효력이 발생합니다. 복사·저장만으로는 제출되지 않으며, 72시간 내 미제출 보상은 0미소로 만료됩니다.<br>' +
      '⑧ 날짜는 한국 시간 기준입니다. 자정을 넘긴 도전은 시작 날짜의 보상으로 정산됩니다.</p></div>' +
      '<button class="btn-primary" data-close>확인</button>');
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
          '<button class="btn-ghost" id="btn-logout" style="width:auto;height:34px;padding:0 10px;font-size:11px">학생 로그아웃</button>' +
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
      (Game.state.balanceAdjustment ? '<div class="setting-row"><div><b>성장 미소 보정 내역</b><p>기존 금액과 보정 후 금액을 확인합니다.</p></div><button class="btn-ghost" id="open-adjustment">내역 보기</button></div>' : '') +
      '<div class="info-note">루멘티아 : 별의 파수꾼<br>' +
        '성장 미소는 육성 전용입니다. 청구 보상은 하루 2회 합산 최대 20,000미소이며, 미청구 시 72시간 후 만료됩니다.<br>' +
        '이 게임의 세계관, 캐릭터, 이름, 일러스트, 음향은 모두 창작된 오리지널 요소이며, 특정 작품의 코드 · 이미지 · 캐릭터를 사용하지 않았습니다.<br><br>' +
        '진행도는 이 브라우저에 자동 저장됩니다.</div>' +
      '<div class="setting-actions">' +
        '<button class="btn-danger" id="btn-reset">저장 초기화</button>' +
        '<button class="btn-ghost" data-close>닫기</button>' +
      '</div>' +
      '<div class="gate-teacher-footer"><a href="/teacher" class="teacher-quiet-link">선생님 관리</a></div>'
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
    const adjustmentButton = m.querySelector('#open-adjustment');
    if (adjustmentButton) adjustmentButton.addEventListener('click', function () { openBalanceAdjustment(Game.state.balanceAdjustment, closeModal); });
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
      logoutBtn.addEventListener('click', openStudentLogout);
    }
  }

  function openStudentLogout() {
    const m = modal('<div class="modal-head"><h2>학생 계정 로그아웃</h2></div>' +
      '<p class="info-note">현재 학생의 영웅과 성장 기록을 저장하고 로그아웃합니다. 다시 로그인하면 이어서 할 수 있습니다.</p>' +
      '<div class="btn-row"><button class="btn-primary" id="confirm-student-logout">학생 로그아웃</button><button class="btn-ghost" data-close>취소</button></div>' +
      '<div class="gate-teacher-footer"><a href="/teacher" class="teacher-quiet-link">선생님 관리</a></div>');
    m.querySelector('#confirm-student-logout').addEventListener('click', function(){Game.logout();});
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
    const eligible = Math.min(info.gold, Game.growthStatus().remaining);
    const m = modal(
      '<div class="offline-art">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/><path d="M17 3.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z"/>' +
        '</svg>' +
      '</div>' +
      '<h2 style="text-align:center;font-size:20px;font-weight:800">수호단의 기록</h2>' +
      '<p class="offline-time">' + fmtDuration(info.seconds) + ' 동안 성장 미소가 쌓였습니다</p>' +
      '<div class="offline-reward"><span>최대 획득 가능 성장 미소</span><b><i class="ico ico-gold"></i>' + fmt(eligible) + '</b></div>' +
      '<p class="offline-cap">하루 남은 획득 한도 안에서 지급 · 청구 보상과 별도</p>' +
      '<button class="btn-primary" id="claim-offline">보상 받기</button>',
      { sticky: true }
    );
    m.querySelector('#claim-offline').addEventListener('click', function () {
      const result = Game.claimOffline(info);
      SFX.play('coin');
      closeModal();
      refreshAll();
      toast('성장 미소 +' + fmt(result.gold), 'gold');
    });
  }

  function updateKeeperHUD() {
    const logout = document.getElementById('btn-student-logout');
    if (logout) logout.hidden = typeof Auth === 'undefined' || !Auth.getCurrentUser();
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
                  return '<button type="button" class="user-chip" data-name="' + escapeHTML(u) + '">' + escapeHTML(u) + '</button>';
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
        '<div class="gate-teacher-footer"><a href="/teacher" class="teacher-quiet-link" aria-label="선생님 관리자 로그인">선생님 관리</a></div>' +
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
    const m = modal('<div class="welcome"><p class="eyebrow">처음이라도 괜찮아요</p><h2>동행과 함께 별길을 걸어요</h2>' +
      '<div class="welcome-steps"><div><b>1 · 동행 만나고 키우기</b><p>무료 소환으로 동행을 만나고, 성장 미소로 레벨을 올려요.</p></div>' +
      '<div><b>2 · 도전하고 금고 수령하기</b><p>전투는 자동이에요. 포인트가 쌓이면 멈추고 수령하세요. 하루 두 번 도전할 수 있어요.</p></div>' +
      '<div><b>3 · 선생님께 보상 청구하기</b><p>인증서를 선생님 클래스톡으로 보내야 효력이 생겨요. 복사만으로는 제출되지 않으며, 72시간 안에 보내야 해요.</p></div></div>' +
      '<p class="info-note">화면 위 안내 버튼이 다음 행동을 알려줘요.<br>오늘 보상 합계 1,000미소 이상을 얻는 구간은 극한 도전이에요. 안전하게 수령하는 것도 좋은 선택이에요!</p>' +
      '<button class="btn-primary" id="welcome-start">무료 동행부터 만나볼래요</button></div>', {sticky:true});
    m.querySelector('#welcome-start').addEventListener('click', function () { SFX.init(); closeModal(); Game.startJourney(); showTab('summon'); });
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
    openChallengeResult: openChallengeResult,
    openSyncNotice: openSyncNotice,
    openBalanceAdjustment: openBalanceAdjustment,
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
