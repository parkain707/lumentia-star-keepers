'use strict';

/* Pure challenge/settlement rules. Reward amounts never come from the growth wallet. */
const Challenge = (function () {
  const DAILY_LIMIT = 20000;
  const DAILY_PLAYS = 2;
  const HARD_REWARD_THRESHOLD = 1000;
  const CLAIM_TTL = 72 * 3600000;
  function integer(n, max) {
    n = Number(n);
    return Number.isFinite(n) ? Math.min(max == null ? Number.MAX_SAFE_INTEGER : max, Math.max(0, Math.floor(n))) : 0;
  }
  function day(timestamp) {
    return new Date((timestamp == null ? Date.now() : timestamp) + 9 * 3600000).toISOString().slice(0, 10);
  }
  function validDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || ''); }
  function sanitizeDays(input) {
    const out = {};
    Object.keys(input || {}).filter(validDay).sort().slice(-90).forEach(function (date) {
      const src = input[date] || {};
      const seen = new Set();
      let total = integer(src.opening, DAILY_LIMIT);
      const records = [];
      (Array.isArray(src.records) ? src.records : []).slice(0, 10).forEach(function (r) {
        if (!r || typeof r.id !== 'string' || seen.has(r.id)) return;
        seen.add(r.id);
        const amount = Math.min(DAILY_LIMIT - total, integer(r.amount, DAILY_LIMIT));
        const record = {id: r.id.slice(0, 100), amount: amount, stage: integer(r.stage), t: integer(r.t), claimedAt: integer(r.claimedAt), copiedAt: integer(r.copiedAt), submissionChannel: r.submissionChannel === 'classtalk' ? 'classtalk' : '', expiredAmount: integer(r.expiredAmount, DAILY_LIMIT), outcome: r.outcome === 'failed' ? 'failed' : 'cashed_out'};
        if (record.outcome === 'failed') record.amount = 0;
        total += record.amount;
        records.push(record);
      });
      out[date] = {used: integer(src.used, DAILY_PLAYS), opening: integer(src.opening, DAILY_LIMIT), records: records};
    });
    return out;
  }
  function entry(state, date) {
    if (!state.rewardDays[date]) state.rewardDays[date] = {used: 0, opening: 0, records: []};
    return state.rewardDays[date];
  }
  function total(state, date) {
    expire(state);
    const d = state.rewardDays[date];
    return d ? Math.min(DAILY_LIMIT, d.opening + d.records.reduce(function (sum, r) { return sum + r.amount; }, 0)) : 0;
  }
  function migrate(data, state, legacyUsed, legacyReward) {
    state.rewardDays = sanitizeDays(data.rewardDays);
    const today = day();
    const d = entry(state, today);
    if (data.v !== 2) {
      // A v1 wallet mixes kills, idle income and payouts. Preserve the original in a backup,
      // correct its spendable balance once, and carry over only explicit same-day cashouts.
      state.gold = Math.min(DAILY_LIMIT, state.gold);
      let confirmed = data.dailyReward && data.dailyReward.date === today ? integer(data.dailyReward.amount, DAILY_LIMIT) : 0;
      const cashouts = (Array.isArray(data.reports) ? data.reports : []).filter(function (r) {
        return r && r.label === '도전 포기 수령' && Number.isFinite(Number(r.t)) && day(Number(r.t)) === today;
      }).reduce(function (sum, r) { return sum + integer(r.amount, DAILY_LIMIT); }, 0);
      confirmed = Math.min(DAILY_LIMIT, Math.max(confirmed, cashouts, integer(legacyReward, DAILY_LIMIT)));
      d.opening = confirmed;
      if (confirmed > 0) {
        d.records.push({id: 'legacy-' + today, amount: confirmed, stage: state.highest, t: Date.now(), claimedAt: 0, copiedAt: 0, submissionChannel: '', expiredAmount: 0, outcome: 'cashed_out'});
        d.opening = 0;
      }
      d.used = Math.max(integer(legacyUsed, 2), data.dailyPlays && data.dailyPlays.date === today ? integer(data.dailyPlays.count, 2) : 0);
      state.migration = {version: 2, at: Date.now(), originalGold: integer(data.gold), correctedGold: state.gold, legacyPot: integer(data.challengePot, DAILY_LIMIT)};
      state.pending = null;
      state.lastSeen = Date.now();
      state.run = null;
    } else {
      state.migration = data.migration || null;
      const r = data.run;
      state.run = r && typeof r.id === 'string' && validDay(r.date) ? {
        id: r.id.slice(0, 100), date: r.date, status: ['active', 'cashed_out', 'failed'].indexOf(r.status) >= 0 ? r.status : 'failed',
        stage: Math.max(1, integer(r.stage, 1000)), cleared: integer(r.cleared, 1000), pot: integer(r.pot, DAILY_LIMIT),
        growth: integer(r.growth), startedAt: integer(r.startedAt), endedAt: integer(r.endedAt),
        amount: integer(r.amount, DAILY_LIMIT), lost: integer(r.lost, DAILY_LIMIT), baseline: r.baseline || null, snapshot: r.snapshot || null
      } : null;
      if (state.run && state.run.status === 'active') {
        const settled = entry(state, state.run.date).records.find(function (r) { return r.id === state.run.id; });
        if (settled) { state.run.status = settled.outcome; state.run.pot = 0; state.run.snapshot = null; }
      }
    }
  }
  function begin(state, id, deviceUsed) {
    if (state.run && state.run.status === 'active') return {ok: false, reason: '진행 중인 도전을 이어서 진행하세요.'};
    const date = day();
    const d = entry(state, date);
    const used = Math.max(d.used, integer(deviceUsed, DAILY_PLAYS));
    if (used >= DAILY_PLAYS) return {ok: false, reason: '오늘의 도전 2회를 모두 사용했습니다.'};
    d.used = used + 1;
    state.run = {id: id, date: date, status: 'active', stage: 1, cleared: 0, pot: 0, growth: 0, startedAt: Date.now(), endedAt: 0, amount: 0, lost: 0, snapshot: null};
    return {ok: true, used: d.used};
  }
  function accumulate(state, stage, points) {
    const r = state.run;
    if (!r || r.status !== 'active' || stage !== r.stage || stage <= r.cleared) return 0;
    const amount = Math.min(integer(points, DAILY_LIMIT), Math.max(0, DAILY_LIMIT - allocated(state, r.date) - r.pot));
    r.pot += amount;
    r.cleared = stage;
    return amount;
  }
  function finish(state, outcome) {
    const r = state.run;
    if (!r || r.status !== 'active') return {ok: false, amount: 0, lost: 0};
    const d = entry(state, r.date);
    if (d.records.some(function (record) { return record.id === r.id; })) return {ok: false, amount: 0, lost: 0};
    const amount = outcome === 'cashed_out' ? Math.min(r.pot, DAILY_LIMIT - allocated(state, r.date)) : 0;
    const lost = outcome === 'failed' ? r.pot : 0;
    d.records.push({id: r.id, amount: amount, stage: r.cleared, t: Date.now(), claimedAt: 0, copiedAt: 0, submissionChannel: '', expiredAmount: 0, outcome: outcome});
    r.status = outcome; r.amount = amount; r.lost = lost; r.pot = 0; r.endedAt = Date.now(); r.snapshot = null;
    return {ok: true, amount: amount, lost: lost, run: r};
  }
  function expire(state) {
    let changed = false;
    Object.keys(state.rewardDays || {}).forEach(function (date) {
      state.rewardDays[date].records.forEach(function (r) {
        if (r.amount > 0 && !r.claimedAt && Date.now() >= r.t + CLAIM_TTL) {
          r.expiredAmount = r.amount; r.amount = 0; changed = true;
        }
      });
    });
    return changed;
  }
  function allocated(state, date) {
    const d = state.rewardDays[date];
    return d ? Math.min(DAILY_LIMIT, d.opening + d.records.reduce(function (sum, r) { return sum + r.amount + (r.expiredAmount || 0); }, 0)) : 0;
  }
  function claim(state, date) {
    expire(state);
    const d = state.rewardDays[date];
    if (!d) return 0;
    let amount = 0;
    d.records.forEach(function (r) {
      if (r.amount > 0 && !r.claimedAt) { r.claimedAt = Date.now(); amount += r.amount; }
    });
    return amount;
  }
  return {DAILY_LIMIT: DAILY_LIMIT, DAILY_PLAYS: DAILY_PLAYS, HARD_REWARD_THRESHOLD: HARD_REWARD_THRESHOLD, CLAIM_TTL: CLAIM_TTL, integer: integer, day: day, entry: entry, total: total, allocated: allocated, expire: expire, claim: claim, migrate: migrate, begin: begin, accumulate: accumulate, finish: finish};
})();
