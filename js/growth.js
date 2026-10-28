'use strict';

/* One daily budget for all growth income. Spending never replenishes this budget. */
const Growth = (function () {
  const LIMIT = 20000;
  const POLICY = 1;
  function daily(state) {
    const date = Challenge.day();
    if (!state.growthDaily || state.growthDaily.date !== date) state.growthDaily = {date: date, earned: 0, fraction: 0, sources: {}};
    return state.growthDaily;
  }
  function migrate(data, state) {
    state.growthPolicyVersion = POLICY;
    if (data.growthPolicyVersion !== POLICY) {
      const before = Challenge.integer(data.gold);
      const after = Math.min(LIMIT, Challenge.integer(state.gold));
      state.gold = after;
      // On the transition day, the corrected opening amount consumes that day's budget.
      state.growthDaily = {date: Challenge.day(), earned: after, fraction: 0, sources: {opening: after}};
      state.balanceAdjustment = {policy: POLICY, at: Date.now(), before: before, after: after, acknowledgedAt: 0};
      return;
    }
    const src = data.growthDaily || {};
    state.growthDaily = {date: src.date, earned: Challenge.integer(src.earned, LIMIT), fraction: Math.min(0.99999999, Math.max(0, Number(src.fraction) || 0)), sources: {}};
    const allowed = ['opening', 'initial', 'kill', 'stage', 'mission', 'offline', 'idle'];
    allowed.forEach(function (key) { if (src.sources && src.sources[key]) state.growthDaily.sources[key] = Challenge.integer(src.sources[key], LIMIT); });
    daily(state);
    const notice = data.balanceAdjustment;
    state.balanceAdjustment = notice && notice.policy === POLICY ? {
      policy: POLICY, at: Challenge.integer(notice.at), before: Challenge.integer(notice.before), after: Challenge.integer(notice.after, LIMIT), acknowledgedAt: Challenge.integer(notice.acknowledgedAt)
    } : null;
  }
  function status(state) {
    const d = daily(state);
    return {date: d.date, earned: d.earned, remaining: Math.max(0, LIMIT - d.earned), limit: LIMIT};
  }
  function credit(state, raw, source) {
    const d = daily(state);
    raw = Number(raw);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    const accumulated = raw + (source === 'idle' ? d.fraction : 0);
    const whole = Math.floor(accumulated + 1e-9);
    const amount = Math.min(whole, LIMIT - d.earned);
    if (source === 'idle') d.fraction = amount < whole || d.earned + amount >= LIMIT ? 0 : Math.max(0, accumulated - whole);
    if (amount <= 0) return 0;
    d.earned += amount;
    d.sources[source] = (d.sources[source] || 0) + amount;
    state.gold += amount;
    state.stats.totalGold += amount;
    if (state.run && state.run.status === 'active') state.run.growth += amount;
    return amount;
  }
  return {LIMIT: LIMIT, POLICY: POLICY, daily: daily, migrate: migrate, status: status, credit: credit};
})();
