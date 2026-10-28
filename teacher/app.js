'use strict';
(function(){
  const $ = id => document.getElementById(id);
  const endpoint = location.hostname === '127.0.0.1' ? '/api/rewards-review' : 'https://ympmjggfpinvcfrfwmgg.supabase.co/functions/v1/lumentia-rewards';
  let session=null, records=[], audit=[], prior=[], priorAllocations=[], students=[], configured=true, selected=null, busy=false, view='new';
  try { session=JSON.parse(sessionStorage.getItem('lumentia_teacher_session')); } catch(e) {}
  const money = n => Math.max(0,Number(n)||0).toLocaleString('ko-KR')+' 미소';
  const escape = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = t => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(t));
  const labels = {unsubmitted:'클래스톡 인증서 확인 필요',requested:'학생이 인증서를 보냈다고 해요',received:'인증서 확인했어요 · 보상 줄 차례',partial:'일부 보상을 줬어요',paid:'보상을 모두 줬어요',expired:'인증서 제출 기한이 지났어요'};
  function message(text) { $('message').textContent=text; }
  function loginMode() {
    $('login-title').textContent=configured?'선생님 로그인':'선생님 계정 최초 설정';
    $('login-description').textContent=configured?'등록한 선생님 이메일과 비밀번호로 로그인하세요. 학생 계정의 로그인 상태와 별도로 이용할 수 있습니다.':'전달받은 일회용 설정 키로 선생님 비밀번호를 직접 설정하세요. 설정을 마치면 이 키는 폐기됩니다.';
    $('setup-field').hidden=configured; $('confirm-field').hidden=configured;
    $('setup-key').required=!configured; $('password-confirm').required=!configured;
    $('password').autocomplete=configured?'current-password':'new-password';
    $('login-button').textContent=configured?'로그인':'비밀번호 설정하고 로그인';
  }
  function signedOut() {
    session=null; sessionStorage.removeItem('lumentia_teacher_session');
    records=[]; audit=[]; prior=[]; priorAllocations=[]; students=[]; selected=null;
    $('action-dialog').close(); $('records').replaceChildren(); $('prior-payments').replaceChildren();
    $('account').textContent=''; $('dashboard').hidden=true; $('login-panel').hidden=false; $('logout').hidden=true; loginMode();
  }
  async function api(action,data={}) {
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data,...(session?{token:session.token}:{})}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if (!response.ok || !result.ok) {
      if(response.status===401 && !['login','setup'].includes(action)) signedOut();
      throw new Error(result.error || '연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    return result;
  }
  function pendingRows() { return records.filter(r=>r.remaining>0 && !['paid','expired'].includes(r.status)); }
  function draw() {
    const sum=fn=>records.reduce((n,r)=>n+fn(r),0);
    $('total-earned').textContent=money(sum(r=>r.amount));
    $('total-unconfirmed').textContent=money(sum(r=>r.receivedAt?0:r.remaining));
    $('total-pending').textContent=money(sum(r=>r.receivedAt?r.remaining:0));
    $('total-paid').textContent=money(sum(r=>r.paid)+prior.reduce((n,p)=>n+p.amount-p.allocated,0));
    const pending=pendingRows(), waiting=prior.filter(p=>!p.student_id);
    $('next-title').textContent=pending.length?'클래스톡에 인증서가 왔다면 아래 학생을 찾아보세요':'새로 처리할 보상은 아직 없어요';
    $('next-description').textContent=pending.length?'화면에 이름이 있어도 인증서가 클래스톡에 도착하지 않았다면 아직 보상을 주지 마세요. 이미 준 보상은 아래 ‘이미 준 보상’에서 따로 확인할 수 있어요.':(waiting.length?'이미 보상을 준 학생에게 게임을 한 번 열어 달라고 부탁해 주세요. 같은 이름의 계정이면 이전 지급액이 자동으로 반영돼요.':'인증서가 새로 도착하면 ‘최신 내용 확인’을 눌러 학생을 찾아보세요.');
    $('flow-steps').hidden=view!=='new';
    if(view==='prior') {
      $('next-title').textContent=waiting.length?'이미 준 학생에게 게임 접속만 부탁해 주세요':'이전에 준 보상이 잘 반영됐는지 확인해 주세요';
      $('next-description').textContent='이미 지급한 사실을 기록한 목록이에요. 학생에게 다시 미소를 주실 필요는 없어요. 학생이 게임을 열면 같은 이름의 계정에서 청구할 보상이 자동으로 줄어들어요.';
    } else if(view==='history') {
      $('next-title').textContent='지난 보상 기록을 확인하는 화면이에요';
      $('next-description').textContent='학생 이름으로 검색하고, 필요한 경우에만 자세한 번호와 처리 이력을 펼쳐 보세요. 새로 지급할 보상은 ‘새로 보상 줄 학생’에서 확인할 수 있어요.';
    }
    $('tab-prior').textContent='이미 준 보상'+(prior.length?' · '+prior.length+'건':'');
    ['new','prior','history'].forEach(v=>$('tab-'+v).setAttribute('aria-pressed',String(v===view)));
    $('prior-panel').hidden=view!=='prior'; $('records-panel').hidden=view==='prior'; $('filter-label').hidden=view!=='history';
    $('records-title').textContent=view==='history'?'지난 보상 기록':'새로 보상 줄 학생';
    $('records-help').textContent=view==='history'?'보상을 준 기록과 제출 기한이 지난 기록을 확인할 수 있어요. 자세한 번호와 처리 이력은 ‘자세히 보기’를 눌러 주세요.':'클래스톡에 인증서가 도착한 학생만 처리해 주세요. ‘인증서 확인하기’부터 누르면 다음 할 일을 차례로 안내해 드려요.';
    $('prior-summary').textContent=prior.length?'이미 주신 보상은 '+prior.length+'건, 총 '+money(prior.reduce((n,p)=>n+p.amount,0))+'예요.':'이전에 지급한 보상 기록이 없어요.';
    $('prior-help').textContent=waiting.length?'‘게임 접속 기다리는 중’인 학생에게 게임을 한 번 열어 달라고 부탁해 주세요. 같은 이름의 계정이면 청구할 보상에서 자동으로 차감돼요. 게임에서 별명을 쓴 경우에만 아래 ‘게임 별명이 다를 때’를 열어 연결하세요.':'연결된 학생의 청구할 보상에서 지급액이 자동으로 차감돼요. 차감이 끝나면 ‘청구 보상에서 차감됐어요’라고 표시돼요.';
    $('prior-help').hidden=!prior.length;
    $('prior-payments').innerHTML=prior.map(p=>{
      const complete=p.allocated===p.amount, connected=!!p.student_id;
      const status=complete?'청구 보상에서 차감됐어요':connected?'게임 보상 기록을 기다리고 있어요':'게임 접속 기다리는 중';
      return '<article class="prior-row"><div class="card-top"><div><h3>'+escape(p.student_name)+'</h3><p class="muted">'+escape(p.reward_day)+' · 이미 준 보상</p></div><strong class="prior-amount">'+money(p.amount)+'</strong></div>'+
        '<p class="prior-state '+(complete?'complete':'')+'">'+status+'</p>'+
        '<details class="history"><summary>지급 내역 자세히 보기</summary><p>지급 시각 '+time(Date.parse(p.paid_at))+'<br>청구 보상에서 차감한 금액 '+money(p.allocated)+'<br>아직 차감할 금액 '+money(p.amount-p.allocated)+'</p></details>'+
        (!connected?'<details class="history manual-link"><summary>게임 별명이 다를 때만 직접 연결</summary><p>이 학생이 게임에서 쓰는 이름과 인증서의 학생 번호를 먼저 확인해 주세요.</p>'+(students.length?'<button class="secondary" data-bind="'+p.id+'">'+escape(p.student_name)+' 학생의 게임 이름 찾기</button>':'<p class="muted">아직 연결할 게임 계정이 없어요. 먼저 학생에게 게임 접속을 부탁해 주세요.</p>')+'</details>':'')+'</article>';
    }).join('');
    const term=$('search').value.trim().toLowerCase(), filter=$('filter').value;
    const visible=(view==='history'?records:pending).filter(r=>(r.studentName+' '+r.studentId+' '+r.settlementId).toLowerCase().includes(term) &&
      (view!=='history' || filter==='all' || (filter==='paid'?r.status==='paid':r.status==='expired')));
    $('records').innerHTML=visible.map(r=>{
      const history=audit.filter(a=>a.claim_id===r.id);
      const priorAmount=priorAllocations.filter(a=>a.claim_id===r.id).reduce((n,a)=>n+a.amount,0);
      const done=r.status==='paid', expired=r.status==='expired';
      const heading=done?'이미 준 보상':expired?'기한이 지나 받을 수 없는 보상':'아직 줄 보상';
      const amount=done?r.paid:expired?r.amount-r.paid:r.remaining;
      let action='';
      if(!done && !r.receivedAt) action='<button data-action="receive" data-id="'+r.id+'">'+(expired?'기한 안에 받은 인증서 확인':'인증서 확인하기')+'</button>';
      else if(!done && r.remaining>0) action='<p class="muted">학생에게 미소를 먼저 준 다음 아래 버튼을 눌러 주세요.</p><button data-action="pay" data-id="'+r.id+'">보상 줬어요 · 기록하기</button>';
      return '<article class="claim-card"><div class="card-top"><div><h3>'+escape(r.studentName)+'</h3><p class="muted">'+escape(r.date)+' 보상</p></div><span class="tag">'+(labels[r.status] || '상태 확인 필요')+'</span></div>'+
        '<div class="reward-focus"><span>'+heading+'</span><b>'+money(amount)+'</b></div>'+
        (priorAmount?'<p class="muted">이전에 주신 보상에서 '+money(priorAmount)+'를 이미 반영했어요.</p>':'')+
        '<div class="card-actions">'+action+'</div>'+
        '<details class="history"><summary>인증서 번호·금액·처리 이력 자세히 보기</summary><p class="settlement">학생 번호 '+escape(r.studentId.slice(0,8))+'<br>인증서 정산 번호 '+escape(r.settlementId)+'</p><p>게임에서 얻은 보상 '+money(r.amount)+'<br>이미 준 금액 '+money(r.paid)+'<br>남은 청구 금액 '+money(r.remaining)+'</p><p>게임 수령 확정 '+time(r.settledAt)+'<br>클래스톡 제출 기한 '+time(r.expiresAt)+(r.receivedAt?'<br>선생님이 확인한 도착 시각 '+time(r.receivedAt):'')+'</p>'+
        (history.length?'<ul>'+history.map(a=>'<li>'+time(Date.parse(a.created_at))+' · '+(a.action==='pay'?'보상 지급 '+money(a.amount):'클래스톡 인증서 확인')+(a.note?' · '+escape(a.note):'')+'</li>').join('')+'</ul>':'')+'</details></article>';
    }).join('') || '<div class="empty-state"><h3>'+(term?'찾는 학생이 없어요':view==='history'?'아직 기록이 없어요':'새로 처리할 보상이 없어요')+'</h3><p>'+(term?'학생의 게임 이름으로 찾아보세요. 목록에 없으면 게임을 한 번 열어 달라고 부탁해 주세요.':view==='history'?'위 메뉴에서 ‘이미 준 보상’을 확인할 수도 있어요.':'이미 지급하신 학생은 ‘이미 준 보상’에서 확인해 주세요. 인증서가 새로 도착하면 ‘최신 내용 확인’을 눌러 보세요.')+'</p></div>';
  }
  async function refresh() {
    const data=await api('list'); records=data.records; audit=data.audit;
    prior=data.priorPayments || []; priorAllocations=data.priorAllocations || []; students=data.students || [];
    $('account').textContent='선생님 계정 · '+session.email; $('login-panel').hidden=true; $('dashboard').hidden=false;
    draw(); $('updated').textContent='마지막 확인 '+time(data.serverTime)+' · 한국 시간';
  }
  function localDateTime(timestamp) { const d=new Date(timestamp); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19); }
  function openAction(action,row) {
    selected={row,action,requestId:crypto.randomUUID()};
    const receive=action==='receive', bind=action==='bind_prior';
    $('action-step').textContent=bind?'이미 준 보상 · 학생 찾기':receive?'1 / 2 · 인증서 확인':'2 / 2 · 보상을 준 뒤 기록';
    $('action-title').textContent=bind?row.student_name+' 학생의 게임 이름 찾기':receive?'클래스톡에 이 인증서가 도착했나요?':'학생에게 미소를 주셨나요?';
    $('action-description').textContent=bind?'이전에 준 보상을 이 게임 계정에 반영해요. 인증서에 적힌 게임 이름과 학생 번호가 같은지 꼭 확인해 주세요.':receive?'클래스톡에 실제로 도착한 인증서의 학생 번호·정산 번호를 아래 내용과 대조해 주세요. 확인을 마치면 보상을 주는 단계로 넘어가요.':'평소 사용하시는 미소 지급 서비스에서 먼저 학생에게 보내 주세요. 이 화면은 미소를 전송하지 않으며, 이미 준 금액을 기록해 학생의 남은 청구 보상에서 차감해요.';
    $('action-student').textContent=bind?row.student_name+' · 이미 준 보상 '+money(row.amount):row.studentName+'\n학생 번호 '+row.studentId.slice(0,8)+'\n인증서 정산 번호 '+row.settlementId+'\n아직 줄 보상 '+money(row.remaining);
    $('bind-field').hidden=!bind; $('bind-student').required=bind; $('bind-student').disabled=!bind;
    $('bind-student').innerHTML='<option value="">게임 이름과 학생 번호를 확인해 선택</option>'+students.map(s=>'<option value="'+s.id+'">'+escape(s.name)+' · 학생 번호 '+s.id.slice(0,8)+'</option>').join('');
    $('received-field').hidden=!receive; $('received-at').required=receive; $('received-at').disabled=!receive; $('received-details').open=receive && row.status==='expired';
    $('received-at').value=localDateTime(Date.now()); $('amount-field').hidden=receive || bind; $('pay-amount').required=!receive && !bind; $('pay-amount').disabled=receive || bind;
    $('pay-amount').value=bind?0:row.remaining; $('pay-amount').max=bind?0:row.remaining;
    $('note').value=''; $('note').closest('label').hidden=bind; $('action-error').textContent='';
    $('confirm-action').textContent=bind?'이 학생이 맞아요 · 연결하기':receive?'인증서 확인했어요 · 다음':money(row.remaining)+' 보상 줬어요 · 기록하기';
    if(!$('action-dialog').open) $('action-dialog').showModal();
  }
  $('records').addEventListener('click',event=>{
    const button=event.target.closest('[data-action]'); if(!button || busy)return;
    const row=records.find(r=>r.id===button.dataset.id); if(row)openAction(button.dataset.action,row);
  });
  $('prior-payments').addEventListener('click',event=>{
    const button=event.target.closest('[data-bind]'); if(!button || busy)return;
    const row=prior.find(p=>p.id===button.dataset.bind); if(row)openAction('bind_prior',row);
  });
  $('cancel-action').addEventListener('click',()=>$('action-dialog').close());
  $('action-form').addEventListener('submit',async event=>{
    event.preventDefault(); if(busy || !selected)return; busy=true; $('confirm-action').disabled=true;
    const {row,action,requestId}=selected;
    try {
      const data=action==='bind_prior'?{priorId:row.id,studentId:$('bind-student').value}:{claimId:row.id,revision:row.revision,requestId,note:$('note').value};
      if(action==='pay') { data.amount=Number($('pay-amount').value); if(!Number.isInteger(data.amount) || data.amount<1 || data.amount>row.remaining)throw new Error('실제로 준 금액을 남은 보상 안에서 정수로 입력해 주세요.'); }
      if(action==='receive') { data.receivedAt=new Date($('received-at').value).getTime(); if(!Number.isFinite(data.receivedAt))throw new Error('클래스톡에 인증서가 도착한 시각을 입력해 주세요.'); }
      await api(action,data);
      if(action==='receive') {
        await refresh(); const next=records.find(r=>r.id===row.id);
        if(next && next.remaining>0) { openAction('pay',next); message('인증서를 확인했어요. 학생에게 미소를 준 다음 기록해 주세요.'); }
        else { $('action-dialog').close(); message('인증서를 확인했어요. 이미 보상을 모두 준 기록이에요.'); }
      } else {
        $('action-dialog').close(); selected=null;
        message(action==='pay'?'보상을 줬다고 기록했어요. 학생의 남은 청구 보상에서 차감돼요.':'이 학생의 게임 계정에 이전 지급 기록을 연결했어요.');
        try { await refresh(); } catch(e) { message('기록은 저장됐어요. 최신 목록을 불러오려면 ‘최신 내용 확인’을 눌러 주세요.'); }
      }
    } catch(e) { $('action-error').textContent=e.message; }
    finally { busy=false; $('confirm-action').disabled=false; }
  });
  $('pay-amount').addEventListener('input',()=>$('confirm-action').textContent=money($('pay-amount').value)+' 보상 줬어요 · 기록하기');
  ['new','prior','history'].forEach(v=>$('tab-'+v).addEventListener('click',()=>{view=v;$('search').value='';message('');draw();}));
  $('search').addEventListener('input',draw); $('filter').addEventListener('change',draw);
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault(); if(busy)return; busy=true; $('login-button').disabled=true;
    try {
      const password=$('password').value;
      if(!configured && (password.length<12 || new TextEncoder().encode(password).length>72 || password!==$('password-confirm').value))throw new Error('12자 이상 비밀번호를 동일하게 두 번 입력해 주세요. 한글 등은 UTF-8 기준 최대 72바이트입니다.');
      session=await api(configured?'login':'setup',{email:$('email').value.trim(),password,setupKey:$('setup-key').value.trim()});
      sessionStorage.setItem('lumentia_teacher_session',JSON.stringify(session)); $('password').value=''; $('password-confirm').value=''; $('setup-key').value='';
      configured=true; loginMode(); $('logout').hidden=false; await refresh(); message('선생님으로 로그인했어요.');
    } catch(e) { message(e.message); } finally { busy=false; $('login-button').disabled=false; }
  });
  $('logout').addEventListener('click',async()=>{try{await api('logout');signedOut();message('로그아웃했어요.');}catch(e){message('로그아웃을 마치지 못했어요. 다시 눌러 주세요.');}});
  $('refresh').addEventListener('click',()=>refresh().then(()=>message('최신 내용을 확인했어요.')).catch(e=>message(e.message)));
  async function boot() {
    try { const state=await api('status'); configured=state.configured; loginMode(); $('logout').hidden=!session;
      if(session && session.expiresAt>Date.now())await refresh(); else signedOut();
    } catch(e) { message(e.message); }
  }
  boot();
})();
