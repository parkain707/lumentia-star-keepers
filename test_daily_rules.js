// Headless verification: run gate, 2 attempts/day, 1,000 hard zone, 5,000 daily cap.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 9446;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = path.join(__dirname, 'audit-daily-rules');

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

class CDP {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 1; this.cb = new Map(); }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = reject;
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.cb.has(data.id)) {
          const { res, rej } = this.cb.get(data.id);
          this.cb.delete(data.id);
          data.error ? rej(data.error) : res(data.result);
        }
      };
    });
  }
  send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = this.id++;
      this.cb.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) {
      throw new Error('Eval failed: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || JSON.stringify(r.exceptionDetails)));
    }
    return r.result ? r.result.value : null;
  }
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(OUT_DIR, name);
    fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
    console.log('[screenshot] ' + p);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAIL: ' + msg);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const profile = path.join(process.env.TEMP, 'chrome-daily-' + Date.now());
  const chrome = spawn(CHROME_PATH, [
    '--headless=new', '--remote-debugging-port=' + PORT, '--remote-allow-origins=*',
    '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', 'about:blank'
  ]);

  await sleep(1500);
  try {
    const page = await (await fetch('http://127.0.0.1:' + PORT + '/json/new?file:///G:/starlight-idle/index.html', { method: 'PUT' })).json();
    const c = new CDP(page.webSocketDebuggerUrl);
    await c.connect();
    await c.send('Page.enable');
    await c.send('Runtime.enable');
    await c.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(1800);

    console.log('\n[0] keeper gate register');
    await c.eval(`(async () => {
      const n = document.querySelector('#gate-name');
      const p = document.querySelector('#gate-pass');
      const f = document.querySelector('#gate-form');
      if (n && p && f) {
        n.value = '별빛수호자';
        p.value = '7777';
        f.dispatchEvent(new Event('submit', { cancelable: true }));
      }
      await new Promise(r => setTimeout(r, 700));
      return true;
    })()`);
    await sleep(800);
    let gate = await c.eval(`({ user: Auth.getCurrentUser(), hasState: !!Game.state })`);
    assert(gate.user && gate.hasState, 'profile registration');
    await c.eval(`UI.closeModal(); true`);

    console.log('\n[1] initial run gate (no auto play)');
    let init = await c.eval(`(() => {
      Game.state.runActive = false;
      Game.state.dailyEarned = { date: Game.state.dailyPlays.date, amount: 0 };
      Game.state.challengePot = 0;
      Game.save();
      UI.renderChallengePot();
      UI.updateRunState();
      const o = document.getElementById('run-overlay');
      const b = document.getElementById('btn-start-run');
      return {
        runActive: Game.state.runActive,
        overlayHidden: o.hidden,
        startDisabled: b.disabled,
        startText: b.textContent,
        desc: document.getElementById('run-overlay-desc').textContent,
        portalSlot: document.querySelectorAll('.nav-btn').length
      };
    })()`);
    console.log(init);
    assert(init.overlayHidden === false, 'overlay visible before start');
    assert(init.startDisabled === false, 'start enabled with 2 attempts');
    assert(init.startText.indexOf('도전 시작') === 0, 'start label');
    assert(init.desc.indexOf('2회') > -1, 'desc shows 2 attempts');

    await c.shot('01-run-gate.png');

    console.log('\n[2] start consumes 1 attempt and battle starts');
    let started = await c.eval(`(async () => {
      document.getElementById('btn-start-run').click();
      await new Promise(r => setTimeout(r, 600));
      return {
        runActive: Game.state.runActive,
        info: Game.dailyInfo(),
        overlayHidden: document.getElementById('run-overlay').hidden,
        badge: document.getElementById('daily-play-badge').textContent,
        heroes: Battle.heroes.length
      };
    })()`);
    console.log(started);
    assert(started.runActive === true, 'runActive after start');
    assert(started.info.used === 1, 'one attempt used');
    assert(started.overlayHidden === true, 'overlay hidden while running');
    assert(started.heroes > 0, 'battle party spawned');

    console.log('\n[3] pot accrual + 1,000 danger threshold');
    let accrue = await c.eval(`(() => {
      const gained = Game.rewardKill(1, false) + Game.rewardKill(3, false) + Game.rewardKill(5, true);
      const pot = Game.getChallengePot();
      Game.state.challengePot = 1200;
      const diff = Game.getDifficultyMultiplier();
      Game.state.challengePot = 999;
      const below = Game.getDifficultyMultiplier();
      Game.state.challengePot = pot;
      UI.renderChallengePot();
      return { pot, diff, below, dangerClass: document.getElementById('pot-bar').className,
        dangerTagHidden: document.getElementById('pot-danger-tag').hidden };
    })()`);
    console.log(accrue);
    assert(accrue.pot > 0, 'kill rewards enter pot');
    assert(accrue.below.isHard === false, 'normal below 1,000');
    assert(accrue.diff.isHard === true && accrue.diff.hpMult >= 1.8, 'hard at 1,200');

    console.log('\n[4] pot ceiling 5,000 + daily budget');
    let ceiling = await c.eval(`(() => {
      Game.state.challengePot = 4000;
      const add1 = Game.rewardKill(40, true);
      const add2 = Game.rewardKill(1, false);
      const pot = Game.getChallengePot();
      const diff = Game.getDifficultyMultiplier();
      UI.renderChallengePot();
      const dangerClass = document.getElementById('pot-bar').className;
      const tagHidden = document.getElementById('pot-danger-tag').hidden;
      const btn = document.getElementById('btn-cashout');
      return { add1, add2, pot, diff, dangerClass, tagHidden, cashoutDisabled: btn.disabled,
        amountText: document.getElementById('pot-amount').textContent,
        budgetText: document.getElementById('pot-budget').textContent };
    })()`);
    console.log(ceiling);
    assert(ceiling.add1 === 1000, 'pot fills to 5,000 only');
    assert(ceiling.add2 === 0, 'no deposits past cap');
    assert(ceiling.pot === 5000, 'pot is 5,000');
    assert(ceiling.dangerClass.indexOf('danger') > -1, 'danger styling at 5,000');
    assert(ceiling.tagHidden === false, 'danger tag visible');
    assert(ceiling.cashoutDisabled === false, 'cashout enabled');
    await c.shot('02-pot-danger.png');

    console.log('\n[5] cashout confirm modal clamps to daily budget and ends run');
    const confirmInfo = await c.eval(`(async () => {
      document.getElementById('btn-cashout').click();
      await new Promise(r => setTimeout(r, 150));
      return {
        shown: !!document.getElementById('btn-confirm-cashout'),
        text: document.getElementById('modal-root').textContent.slice(0, 120),
        pot: Game.getChallengePot(),
        gold: Game.state.gold
      };
    })()`);
    console.log('confirm modal:', confirmInfo);
    assert(confirmInfo.shown === true, 'cashout confirm modal shown');
    assert(confirmInfo.text.indexOf('1,000') > -1, 'danger warning in confirm modal');
    assert(confirmInfo.pot === 5000, 'pot intact while modal open');
    await c.shot('03b-cashout-confirm.png');

    let cash = await c.eval(`(async () => {
      const goldBefore = Game.state.gold;
      const cancelBtn = document.querySelector('#modal-root [data-close]');
      if (cancelBtn) cancelBtn.click();
      await new Promise(r => setTimeout(r, 100));
      const afterCancel = {
        pot: Game.getChallengePot(),
        modalGone: !document.getElementById('btn-confirm-cashout'),
        gold: Game.state.gold
      };
      document.getElementById('btn-cashout').click();
      await new Promise(r => setTimeout(r, 150));
      const confirm2 = document.getElementById('btn-confirm-cashout');
      if (confirm2) confirm2.click();
      await new Promise(r => setTimeout(r, 300));
      return {
        afterCancel, goldBefore, goldAfter: Game.state.gold,
        pot: Game.getChallengePot(), info: Game.dailyInfo(),
        cert: !!document.querySelector('.cert-modal'),
        reportHidden: document.getElementById('teacher-report').hidden,
        overlayHidden: document.getElementById('run-overlay').hidden,
        budgetText: document.getElementById('pot-budget').textContent
      };
    })()`);
    console.log(cash);
    assert(cash.afterCancel.pot === 5000 && cash.afterCancel.modalGone === true, 'cancel keeps pot');
    assert(cash.goldAfter - cash.goldBefore === 5000, 'gold +5,000');
    assert(cash.pot === 0, 'pot emptied');
    assert(cash.info.earned === 5000 && cash.info.remaining === 0, 'daily earned capped');
    assert(cash.info.runActive === false, 'run ended on cashout');
    assert(cash.cert === true, 'teacher certificate opened');
    assert(cash.reportHidden === false, 'teacher report shown');
    assert(cash.overlayHidden === false, 'run overlay back');
    await c.shot('03-certificate.png');
    await c.eval(`UI.closeModal(); true`);

    console.log('\n[6] cap blocks all smile grants');
    let blocked = await c.eval(`(() => {
      const budget = Game.budgetLeft();
      const d = Game.rewardKill(40, true);
      Game.state.challengePot = 300;
      const cash = Game.cashoutChallengePot();
      return { budget, d, cash, gold: Game.state.gold, earned: Game.dailyInfo().earned };
    })()`);
    console.log(blocked);
    assert(blocked.d === 0, 'no income after cap');
    assert(blocked.budget === 0, 'daily budget exhausted');
    assert(blocked.cash.ok === false && blocked.cash.reason === 'daily-cap', 'cashout blocked at cap');
    assert(blocked.earned === 5000, 'earned stays 5,000');

    console.log('\n[7] second attempt, defeat ends run; third start blocked');
    let attempts = await c.eval(`(async () => {
      const second = Battle.start();
      Game.state.challengePot = 800;
      const fail = Game.failChallengePot();
      Battle.pause();
      Game.endRun();
      const afterEnd = { runActive: Game.state.runActive, info: Game.dailyInfo() };
      const third = Battle.start();
      await new Promise(r => setTimeout(r, 300));
      const modalText = (document.getElementById('modal-root').textContent || '');
      return { second, fail, afterEnd, third,
        modalHasLimit: modalText.indexOf('2회') > -1 || modalText.indexOf('도전') > -1,
        badge: document.getElementById('daily-play-badge').textContent,
        startDisabled: document.getElementById('btn-start-run').disabled,
        startText: document.getElementById('btn-start-run').textContent
      };
    })()`);
    console.log(attempts);
    assert(attempts.second === true, 'second attempt started');
    assert(attempts.fail.lost === 800, 'defeat wipes pot');
    assert(attempts.afterEnd.runActive === false && attempts.afterEnd.info.attemptsLeft === 0, 'no attempts left');
    assert(attempts.third === false, 'third start blocked');
    assert(attempts.modalHasLimit, 'daily limit modal shown');
    assert(attempts.badge.indexOf('0/2') > -1, 'badge 0/2');
    assert(attempts.startDisabled === true && attempts.startText.indexOf('완료') > -1, 'start disabled');
    await c.shot('04-daily-limit.png');

    console.log('\n[8] new day resets attempts/earned and never auto-runs');
    let reset = await c.eval(`(() => {
      Game.state.dailyPlays.date = '2000-01-01';
      Game.state.dailyEarned.date = '2000-01-01';
      Game.state.runActive = true;
      Game.state.challengePot = 600;
      Game.save();
      return true;
    })()`);
    assert(reset === true, 'save simulated old day');
    await c.send('Page.reload');
    await sleep(2200);
    await c.eval(`UI.closeModal(); true`);
    let afterReload = await c.eval(`(() => {
      const info = Game.dailyInfo();
      return {
        info, runActive: Game.state.runActive, pot: Game.getChallengePot(),
        overlayHidden: document.getElementById('run-overlay').hidden,
        startDisabled: document.getElementById('btn-start-run').disabled,
        heroes: Battle.heroes.length,
        date: Game.state.dailyPlays.date
      };
    })()`);
    console.log(afterReload);
    assert(afterReload.info.attemptsLeft === 2 && afterReload.info.earned === 0, 'new day reset');
    assert(afterReload.runActive === false, 'old run not resumed');
    assert(afterReload.heroes === 0, 'battle not auto-started');
    assert(afterReload.pot === 600, 'pot preserved and claimable');
    assert(afterReload.overlayHidden === false && afterReload.startDisabled === false, 'overlay ready');
    await c.shot('05-new-day.png');

    console.log('\nALL DAILY RULE CHECKS PASSED');
  } finally {
    try { chrome.kill(); } catch (e) {}
  }
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
