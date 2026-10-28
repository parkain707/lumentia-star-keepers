'use strict';

// Reward ledger only. Hero/growth saves remain in the existing local slots.
var Rewards = (function () {
  const ENDPOINT = typeof location !== 'undefined' && location.hostname === '127.0.0.1' ? '/api/rewards-review' : 'https://ympmjggfpinvcfrfwmgg.supabase.co/functions/v1/lumentia-rewards';
  let flight = null, error = '', lastSync = 0;
  const caches = new Map();
  function identity() { return typeof Auth !== 'undefined' ? Auth.getRewardIdentity() : null; }
  function cached() {
    const id = identity();
    if (!id) return null;
    if (!caches.has(id.id)) {
      let value = null;
      try { value = JSON.parse(localStorage.getItem('lumentia_rewards_' + id.id)); } catch(e) {}
      caches.set(id.id, value && Array.isArray(value.records) ? value : null);
    }
    return caches.get(id.id);
  }
  function decorate(row) {
    const cache = cached();
    const remote = cache && cache.records.find(function(r) { return r.settlementId === row.id; });
    const expired = remote && remote.paid < remote.amount && !remote.receivedAt && Date.now() + (cache.offset || 0) >= remote.expiresAt;
    return Object.assign({}, row, {
      paidAmount: remote ? remote.paid : 0,
      outstanding: remote ? (expired ? 0 : remote.remaining) : row.amount,
      receivedAt: remote ? remote.receivedAt : 0,
      ledgerStatus: remote ? (expired ? 'expired' : remote.status) : '',
      ledgerAmount: remote ? remote.amount : row.amount + (row.expiredAmount || 0)
    });
  }
  async function sync() {
    const id = identity();
    if (!id || typeof Game === 'undefined' || !Game.state) return {ok:false};
    if (flight) return flight;
    const name = Auth.getCurrentUser();
    const records = [];
    Object.keys(Game.state.rewardDays).sort().slice(-90).forEach(function(date) {
      Game.state.rewardDays[date].records.forEach(function(r) {
        const amount = r.amount + (r.expiredAmount || 0);
        if (r.outcome === 'cashed_out' && amount > 0) records.push({id:r.id,date:date,amount:amount,t:r.t,requestedAt:r.claimedAt || 0});
      });
    });
    flight = (async function() {
      try {
        const response = await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'sync',studentId:id.id,secret:id.secret,name:name,records:records}),signal:AbortSignal.timeout(20000)});
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || '보상 기록 연결을 완료하지 못했습니다.');
        // A response for an old account must never appear in a newly selected account.
        if (Auth.getCurrentUser() !== name || identity()?.id !== id.id) return {ok:false};
        const previous = cached();
        const value = {records:result.records,offset:result.serverTime-Date.now()};
        caches.set(id.id,value);
        try { localStorage.setItem('lumentia_rewards_'+id.id,JSON.stringify(value)); } catch(e) {}
        lastSync=Date.now();error='';
        if (!previous || JSON.stringify(previous.records)!==JSON.stringify(value.records)) window.dispatchEvent(new Event('lumentia-rewards'));
        return {ok:true,rejected:result.rejected};
      } catch(e) { error=e.name==='TimeoutError'?'연결 시간이 초과되었습니다. 다시 확인해 주세요.':e.message;return {ok:false,error:error}; }
      finally { flight=null; }
    })();
    return flight;
  }
  function start() {
    sync();
    setInterval(function(){if(document.visibilityState==='visible' && Auth.getCurrentUser())sync();},30000);
    window.addEventListener('focus',function(){if(Auth.getCurrentUser())sync();});
  }
  return {sync:sync,start:start,decorate:decorate,identity:identity,endpoint:ENDPOINT,
    get status(){return {error:error,lastSync:lastSync,connected:!!cached()};}};
})();
