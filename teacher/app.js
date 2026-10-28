'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const endpoint=location.hostname==='127.0.0.1'?'/api/rewards-review':'https://ympmjggfpinvcfrfwmgg.supabase.co/functions/v1/lumentia-rewards';
  let session=null,records=[],audit=[],prior=[],priorAllocations=[],students=[],configured=true,selected=null,busy=false;
  try{session=JSON.parse(sessionStorage.getItem('lumentia_teacher_session'));}catch(e){}
  const money=n=>Math.max(0,Number(n)||0).toLocaleString('ko-KR')+' 미소';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time=t=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'medium'}).format(new Date(t));
  const label={unsubmitted:'클래스톡 수신 전',requested:'학생 제출 기록 · 수신 확인 필요',received:'수신 확인 · 지급 대기',partial:'일부 지급 완료',paid:'지급 완료',expired:'미제출 만료'};
  function message(text){$('message').textContent=text;}
  function loginMode(){
    $('login-title').textContent=configured?'선생님 로그인':'선생님 계정 최초 설정';
    $('login-description').textContent=configured?'등록한 선생님 이메일과 비밀번호로 로그인하세요. 학생 계정의 로그인 상태와 별도로 이용할 수 있습니다.':'전달받은 일회용 설정 키로 선생님 비밀번호를 직접 설정하세요. 설정을 마치면 이 키는 폐기됩니다.';
    $('setup-field').hidden=configured;$('confirm-field').hidden=configured;$('setup-key').required=!configured;$('password-confirm').required=!configured;
    $('password').autocomplete=configured?'current-password':'new-password';$('login-button').textContent=configured?'로그인':'비밀번호 설정하고 로그인';
  }
  function signedOut(){session=null;sessionStorage.removeItem('lumentia_teacher_session');records=[];audit=[];prior=[];priorAllocations=[];students=[];$('records').replaceChildren();$('prior-payments').replaceChildren();$('account').textContent='';$('dashboard').hidden=true;$('login-panel').hidden=false;$('logout').hidden=true;loginMode();}
  async function api(action,data={}){
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data,...(session?{token:session.token}:{})}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(!response.ok || !result.ok){if(response.status===401 && !['login','setup'].includes(action))signedOut();throw new Error(result.error || '연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');}
    return result;
  }
  function draw(){
    const sum=fn=>records.reduce((n,r)=>n+fn(r),0);
    $('total-earned').textContent=money(sum(r=>r.amount));$('total-paid').textContent=money(sum(r=>r.paid)+prior.reduce((n,p)=>n+p.amount-p.allocated,0));
    $('prior-payments').innerHTML=prior.map(p=>'<article class="claim-card"><div class="card-top"><b>'+escape(p.student_name)+'</b><span class="tag">'+(p.student_id?'학생 연결됨':'학생 연결 대기')+'</span></div><p>'+money(p.amount)+' 지급 · '+time(Date.parse(p.paid_at))+'</p><p class="muted">보상 기준일 '+escape(p.reward_day)+' · 차감 반영 '+money(p.allocated)+' · 연결·정산 대기 '+money(p.amount-p.allocated)+'</p>'+(!p.student_id?'<label>연결할 게임 계정<select data-prior-student="'+p.id+'"><option value="">학생 번호를 확인해 선택</option>'+students.map(s=>'<option value="'+s.id+'">'+escape(s.name)+' · '+s.id.slice(0,8)+'</option>').join('')+'</select></label><button class="secondary" data-bind="'+p.id+'">이 학생에게 기지급 연결</button>':'')+'</article>').join('') || '<p class="muted">등록된 기지급 내역이 없습니다.</p>';
    $('total-unconfirmed').textContent=money(sum(r=>r.receivedAt?0:r.remaining));$('total-pending').textContent=money(sum(r=>r.receivedAt?r.remaining:0));
    const term=$('search').value.trim().toLowerCase(),filter=$('filter').value;
    const visible=records.filter(r=>(r.studentName+' '+r.studentId+' '+r.settlementId).toLowerCase().includes(term) &&
      (filter==='all' || (filter==='paid'?r.status==='paid':filter==='expired'?r.status==='expired':!['paid','expired'].includes(r.status))));
    $('records').innerHTML=visible.map(r=>{
      const history=audit.filter(a=>a.claim_id===r.id);
      const priorAmount=priorAllocations.filter(a=>a.claim_id===r.id).reduce((n,a)=>n+a.amount,0);
      return '<article class="claim-card"><div class="card-top"><div><h3>'+escape(r.studentName)+'</h3><p class="muted">학생 번호 '+escape(r.studentId.slice(0,8))+' · 보상 기준일 '+escape(r.date)+'</p></div><span class="tag">'+label[r.status]+'</span></div>'+ 
        '<p class="settlement">정산 번호 '+escape(r.settlementId)+'</p><div class="card-amounts"><div><span>확정 획득</span><b>'+money(r.amount)+'</b></div><div><span>지급 완료</span><b>'+money(r.paid)+'</b></div><div><span>남은 청구 금액</span><b>'+money(r.remaining)+'</b></div></div>'+ 
        '<p class="muted">수령 확정 '+time(r.settledAt)+' · 제출 기한 '+time(r.expiresAt)+(r.receivedAt?'<br>클래스톡 수신 '+time(r.receivedAt):'')+(priorAmount?'<br>기지급 내역에서 '+money(priorAmount)+' 반영':'')+'</p>'+ 
        '<div class="card-actions">'+(!r.receivedAt?'<button class="secondary" data-action="receive" data-id="'+r.id+'">클래스톡 수신 확인</button>':'')+
        '<button data-action="pay" data-id="'+r.id+'" '+(!r.receivedAt || !r.remaining?'disabled':'')+'>지급 완료 기록</button></div>'+ 
        (history.length?'<details class="history"><summary>처리 이력 '+history.length+'건</summary><ul>'+history.map(a=>'<li>'+time(Date.parse(a.created_at))+' · '+(a.action==='pay'?'지급 '+money(a.amount):'클래스톡 수신 확인')+(a.note?' · '+escape(a.note):'')+'</li>').join('')+'</ul></details>':'')+'</article>';
    }).join('') || '<p class="muted">표시할 내역이 없습니다. 학생이 업데이트된 게임에 접속하면 확정 보상이 연결됩니다.</p>';
  }
  async function refresh(){const data=await api('list');records=data.records;audit=data.audit;prior=data.priorPayments || [];priorAllocations=data.priorAllocations || [];students=data.students || [];$('account').textContent=session.email;$('login-panel').hidden=true;$('dashboard').hidden=false;draw();$('updated').textContent='마지막 확인 '+time(data.serverTime)+' · 한국 시간';}
  $('prior-payments').addEventListener('click',async event=>{
    const button=event.target.closest('[data-bind]');if(!button || busy)return;
    const select=$('prior-payments').querySelector('[data-prior-student="'+button.dataset.bind+'"]');
    if(!select.value){message('클래스톡의 학생 번호를 확인해 연결할 계정을 선택하세요.');return;}
    const student=students.find(s=>s.id===select.value),payment=prior.find(p=>p.id===button.dataset.bind);
    if(!confirm(payment.student_name+'의 '+money(payment.amount)+' 기지급 내역을 '+student.name+' ('+student.id.slice(0,8)+')에게 연결할까요?'))return;
    busy=true;button.disabled=true;try{await api('bind_prior',{studentId:select.value,priorId:button.dataset.bind});await refresh();message('기지급 내역을 학생에게 연결했습니다.');}catch(e){message(e.message);}finally{busy=false;button.disabled=false;}
  });
  function localDateTime(timestamp){const d=new Date(timestamp);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,19);}
  $('records').addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');if(!button)return;
    const row=records.find(r=>r.id===button.dataset.id);if(!row)return;
    selected={row:row,action:button.dataset.action,requestId:crypto.randomUUID()};
    $('action-title').textContent=selected.action==='pay'?'지급 완료 기록':'클래스톡 수신 확인';
    $('action-description').textContent=selected.action==='pay'?'실제 미소 지급을 마친 뒤 기록하세요. 입력한 금액만큼 학생의 청구 잔액이 줄어듭니다.':'실제로 도착한 인증서의 학생 번호·정산 번호와 수신 시각을 확인하세요. 기한 안에 도착한 건은 지급 대기로 보관됩니다.';
    $('action-student').textContent=row.studentName+' · '+row.studentId.slice(0,8)+'\n'+row.settlementId+'\n남은 청구 금액 '+money(row.remaining);
    $('received-field').hidden=selected.action!=='receive';$('amount-field').hidden=selected.action!=='pay';
    $('received-at').value=localDateTime(Date.now());$('received-at').required=selected.action==='receive';
    $('pay-amount').value=row.remaining;$('pay-amount').max=row.remaining;$('pay-amount').required=selected.action==='pay';
    $('note').value='';$('action-error').textContent='';$('confirm-action').textContent=selected.action==='pay'?'지급 완료로 기록':'클래스톡 수신 확정';$('action-dialog').showModal();
  });
  $('cancel-action').addEventListener('click',()=>$('action-dialog').close());
  $('action-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy || !selected)return;busy=true;$('confirm-action').disabled=true;
    const {row,action,requestId}=selected;
    try{
      const data={claimId:row.id,revision:row.revision,requestId,note:$('note').value};
      if(action==='pay'){data.amount=Number($('pay-amount').value);if(!Number.isInteger(data.amount) || data.amount<1 || data.amount>row.remaining)throw new Error('남은 금액 안에서 정수로 입력해 주세요.');}
      else {data.receivedAt=new Date($('received-at').value).getTime();if(!Number.isFinite(data.receivedAt))throw new Error('실제 수신 시각을 입력해 주세요.');}
      await api(action,data);$('action-dialog').close();await refresh();message(action==='pay'?'지급 기록을 저장했습니다. 학생이 연결하면 청구 잔액에 반영됩니다.':'클래스톡 수신을 확인했습니다. 지급 대기로 보관됩니다.');
    }catch(e){$('action-error').textContent=e.message;}finally{busy=false;$('confirm-action').disabled=false;}
  });
  $('pay-amount').addEventListener('input',()=>{$('confirm-action').textContent=money($('pay-amount').value)+' 지급 완료로 기록';});
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;busy=true;$('login-button').disabled=true;
    try{
      const password=$('password').value;
      if(!configured && (password.length<12 || new TextEncoder().encode(password).length>72 || password!==$('password-confirm').value))throw new Error('12자 이상 비밀번호를 동일하게 두 번 입력해 주세요. 한글 등은 UTF-8 기준 최대 72바이트입니다.');
      session=await api(configured?'login':'setup',{email:$('email').value.trim(),password,setupKey:$('setup-key').value.trim()});
      sessionStorage.setItem('lumentia_teacher_session',JSON.stringify(session));$('password').value='';$('password-confirm').value='';$('setup-key').value='';configured=true;loginMode();$('logout').hidden=false;
      await refresh();message('선생님으로 로그인했습니다.');
    }catch(e){message(e.message);}finally{busy=false;$('login-button').disabled=false;}
  });
  $('logout').addEventListener('click',async()=>{try{await api('logout');signedOut();message('로그아웃했습니다.');}catch(e){message('서버 로그아웃을 완료하지 못했습니다. 다시 시도해 주세요.');}});
  $('refresh').addEventListener('click',()=>refresh().then(()=>message('최신 지급 내역을 확인했습니다.')).catch(e=>message(e.message)));
  $('search').addEventListener('input',draw);$('filter').addEventListener('change',draw);
  async function boot(){
    try{
      const state=await api('status');configured=state.configured;loginMode();$('logout').hidden=!session;
      if(session && session.expiresAt>Date.now())await refresh();else signedOut();
    }catch(e){message(e.message);}
  }
  boot();
})();
