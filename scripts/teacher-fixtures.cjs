// Local review only. No requests from this fixture reach Supabase or ClassTalk.
const {randomUUID}=require('node:crypto');const students=new Map();const rows=[];const audit=[];
const token='local-review-teacher-session';let prior=[];
exports.handle=function(p){
  if(p.action==='seed_demo'){
    rows.length=0;audit.length=0;students.clear();
    const now=Date.now(),date=new Date(now+9*3600000).toISOString().slice(0,10),sid=randomUUID();students.set(sid,'review-only');
    rows.push({id:randomUUID(),studentName:'검증학생 하나',studentId:sid,settlementId:'REVIEW-CERTIFICATE-ONLY',date,amount:1200,settledAt:now-60000,expiresAt:now+72*3600000,paid:0,remaining:1200,revision:0,status:'requested'});
    prior=[{id:randomUUID(),student_name:'검증학생 둘',student_id:null,reward_day:date,amount:20000,paid_at:new Date(now-3600000).toISOString(),allocated:0},{id:randomUUID(),student_name:'검증학생 셋',student_id:null,reward_day:date,amount:3775,paid_at:new Date(now-3600000).toISOString(),allocated:0}];
    return {ok:true};
  }
  if(p.action==='status')return {ok:true,configured:true};
  if(p.action==='login')return p.email==='review@example.test' && p.password==='review-password-only'?{ok:true,email:p.email,token,expiresAt:Date.now()+3600000}:{ok:false,error:'검증 계정 정보를 확인하세요.'};
  if(p.action==='sync'){
    if(students.has(p.studentId) && students.get(p.studentId)!==p.secret)return {ok:false,error:'학생 연결 불일치'};
    students.set(p.studentId,p.secret);
    for(const r of p.records){let old=rows.find(x=>x.studentId===p.studentId && x.settlementId===r.id);if(!old){old={id:randomUUID(),studentName:p.name,studentId:p.studentId,settlementId:r.id,date:r.date,amount:r.amount,settledAt:r.t,expiresAt:r.t+72*3600000,paid:0,remaining:r.amount,revision:0,status:'unsubmitted'};rows.push(old);}if(r.requestedAt && old.status==='unsubmitted')old.status='requested';}
    return {ok:true,records:rows.filter(x=>x.studentId===p.studentId),rejected:[],serverTime:Date.now()};
  }
  if(p.token!==token)return {ok:false,error:'검증 선생님 로그인 필요'};
  if(p.action==='list')return {ok:true,records:rows,audit,priorPayments:prior,priorAllocations:[],students:Array.from(students.keys()).map(id=>({id,name:rows.find(r=>r.studentId===id)?.studentName || '검증 계정'})),serverTime:Date.now()};
  if(p.action==='logout')return {ok:true};
  if(p.action==='bind_prior'){const row=prior.find(x=>x.id===p.priorId);if(!row || row.student_id)return {ok:false,error:'연결 내역을 확인해 주세요.'};row.student_id=p.studentId;return {ok:true};}
  const r=rows.find(x=>x.id===p.claimId);if(!r || r.revision!==p.revision)return {ok:false,error:'검증 내역 갱신 필요'};
  if(p.action==='receive'){r.receivedAt=p.receivedAt;r.status='received';}
  else if(p.action==='pay' && r.receivedAt && p.amount>0 && p.amount<=r.remaining){r.paid+=p.amount;r.remaining-=p.amount;r.status=r.remaining?'partial':'paid';}
  else return {ok:false,error:'검증 지급 금액 확인 필요'};
  r.revision++;audit.push({claim_id:r.id,action:p.action,amount:p.amount||0,note:p.note||'',created_at:new Date().toISOString()});return {ok:true,record:r};
};
