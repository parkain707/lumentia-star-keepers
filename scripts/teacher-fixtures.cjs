// Local review only. No requests from this fixture reach Supabase or ClassTalk.
const {randomUUID}=require('node:crypto');const students=new Map();const rows=[];const audit=[];
const token='local-review-teacher-session';
exports.handle=function(p){
  if(p.action==='status')return {ok:true,configured:true};
  if(p.action==='login')return p.email==='review@example.test' && p.password==='review-password-only'?{ok:true,email:p.email,token,expiresAt:Date.now()+3600000}:{ok:false,error:'검증 계정 정보를 확인하세요.'};
  if(p.action==='sync'){
    if(students.has(p.studentId) && students.get(p.studentId)!==p.secret)return {ok:false,error:'학생 연결 불일치'};
    students.set(p.studentId,p.secret);
    for(const r of p.records){let old=rows.find(x=>x.studentId===p.studentId && x.settlementId===r.id);if(!old){old={id:randomUUID(),studentName:p.name,studentId:p.studentId,settlementId:r.id,date:r.date,amount:r.amount,settledAt:r.t,expiresAt:r.t+72*3600000,paid:0,remaining:r.amount,revision:0,status:'unsubmitted'};rows.push(old);}if(r.requestedAt && old.status==='unsubmitted')old.status='requested';}
    return {ok:true,records:rows.filter(x=>x.studentId===p.studentId),rejected:[],serverTime:Date.now()};
  }
  if(p.token!==token)return {ok:false,error:'검증 선생님 로그인 필요'};
  if(p.action==='list')return {ok:true,records:rows,audit,serverTime:Date.now()};
  if(p.action==='logout')return {ok:true};
  const r=rows.find(x=>x.id===p.claimId);if(!r || r.revision!==p.revision)return {ok:false,error:'검증 내역 갱신 필요'};
  if(p.action==='receive'){r.receivedAt=p.receivedAt;r.status='received';}
  else if(p.action==='pay' && r.receivedAt && p.amount>0 && p.amount<=r.remaining){r.paid+=p.amount;r.remaining-=p.amount;r.status=r.remaining?'partial':'paid';}
  else return {ok:false,error:'검증 지급 금액 확인 필요'};
  r.revision++;audit.push({claim_id:r.id,action:p.action,amount:p.amount||0,note:p.note||'',created_at:new Date().toISOString()});return {ok:true,record:r};
};
