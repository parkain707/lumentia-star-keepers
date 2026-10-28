// Development-only fixtures, served only by scripts/serve.cjs on loopback.
exports.page = function () {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>루멘티아 로컬 검증 계정</title>
  <style>body{font:18px sans-serif;background:#10172c;color:#edf3ff;max-width:700px;margin:60px auto;padding:20px;line-height:1.8}button{font:inherit;padding:12px 24px;background:#ffe09b;border:0;border-radius:8px}code{color:#ffe09b}</style>
  <h1>기존 기록 승계 검증</h1><p>로컬 테스트 계정에 <code>442,808 성장 미소 · 최고 스테이지 29 · 영웅 4명</code>을 넣고 개편 버전으로 전환합니다. 실제 운영 계정과 연결되지 않습니다.</p>
  <button id="seed-migration">가상 기존 계정으로 검증 시작</button><p id="status"></p>
  <script src="/js/auth.js"></script><script>
  document.getElementById('seed-migration').onclick=async function(){
    const name='검토용파수꾼'; const pass='local-review-only';
    let result=await Auth.register(name,pass); if(!result.ok) result=await Auth.login(name,pass);
    if(!result.ok){document.getElementById('status').textContent=result.error;return;}
    const d=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
    localStorage.setItem(Auth.getSaveKeyForUser(name),JSON.stringify({v:1,gold:442808,gems:1200,highest:29,
      owned:['lumen','mirea','pio','aries'],party:['lumen','mirea','aries'],
      heroes:{lumen:{lv:40,star:3,shards:19},mirea:{lv:20,star:2,shards:44},pio:{lv:12,star:1,shards:8},aries:{lv:20,star:2,shards:31}},
      freeTen:false,pity:15,tutorial:true,sfx:false,dailyPlays:{date:d,count:0},stats:{summons:30,bossKills:15,ascends:5,ssrAscends:1,maxPower:15000,totalGold:442808},achievements:{sm10:true},lastSeen:Date.now(),reports:[]}));
    location.replace('/');
  };
  </script></html>`;
};
exports.newStudent = function () {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>학생 첫 이용 검증</title>
  <style>body{font:18px sans-serif;background:#10172c;color:#edf3ff;max-width:700px;margin:60px auto;padding:20px;line-height:1.8}button{font:inherit;padding:12px 24px;background:#ffe09b;border:0;border-radius:8px}</style>
  <h1>학생 첫 이용 검증</h1><p>새로운 로컬 연습 계정으로 학생 안내를 확인합니다.</p><button id="new-student">처음 이용하는 학생으로 시작</button>
  <script src="/js/auth.js"></script><script>document.getElementById('new-student').onclick=async function(){
    const name='학생연습'+Date.now().toString().slice(-5);await Auth.register(name,'local-review-only');location.replace('/');
  };</script></html>`;
};
exports.classTalk = function () {
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>클래스톡 제출 안내 검증</title>
  <style>body{font:18px sans-serif;background:#10172c;color:#edf3ff;max-width:700px;margin:60px auto;padding:20px;line-height:1.8}button{font:inherit;padding:12px 24px;background:#ffe09b;border:0;border-radius:8px}</style>
  <h1>클래스톡 제출 안내 검증</h1><p>가상 확정 보상 1,200미소로 인증서 복사와 제출 기록을 구분해 확인합니다. 실제 선생님께 전송하지 않습니다.</p><button id="seed-classtalk">가상 인증서 검증 시작</button>
  <script src="/js/auth.js"></script><script>document.getElementById('seed-classtalk').onclick=async function(){
    const name='클래스톡검증'+Date.now().toString().slice(-4);await Auth.register(name,'local-review-only');
    const date=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
    const state={v:2,gold:300,gems:1200,highest:2,owned:['lumen','mirea','pio'],party:['lumen','mirea','pio'],heroes:{lumen:{lv:2,star:1,shards:0},mirea:{lv:2,star:1,shards:0},pio:{lv:2,star:1,shards:0}},tutorial:true,sfx:false,freeTen:false,onboarding:{grown:true},growthPolicyVersion:1,growthDaily:{date:date,earned:300,fraction:0,sources:{initial:300}},rewardDays:{},lastSeen:Date.now()};
    state.rewardDays[date]={used:1,opening:0,records:[{id:'REVIEW-CLASSTALK-ONLY',amount:1200,stage:2,t:Date.now(),claimedAt:0,copiedAt:0,submissionChannel:'',expiredAmount:0,outcome:'cashed_out'}]};
    localStorage.setItem(Auth.getSaveKeyForUser(name),JSON.stringify(state));location.replace('/');
  };</script></html>`;
};
