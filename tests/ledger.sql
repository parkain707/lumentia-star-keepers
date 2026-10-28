-- All synthetic students, authentication and payment rows are rolled back.
begin;
insert into lumentia_private.teacher(singleton,email,setup_hash) values(true,'review@example.test',encode(extensions.digest('fixture-setup-key','sha256'),'hex'))
on conflict(singleton) do update set email=excluded.email,setup_hash=excluded.setup_hash,password_hash=null,configured_at=null;
do $$
declare
  r jsonb; auth jsonb; base jsonb; row jsonb; sid uuid:=gen_random_uuid(); sid2 uuid:=gen_random_uuid();
  secret text:=repeat('1',64); token text; claim_id text; req uuid; rev integer; ts numeric:=floor(extract(epoch from now()-interval '1 minute')*1000);
  day text:=to_char((now()-interval '1 minute') at time zone 'Asia/Seoul','YYYY-MM-DD');
begin
  r:=public.lumentia_gateway('{"action":"status"}'); assert r->>'configured'='false','initial setup state';
  r:=public.lumentia_gateway('{"action":"setup","email":"review@example.test","setupKey":"wrong","password":"review-password-only"}'); assert r->>'ok'='false','wrong setup denied';
  auth:=public.lumentia_gateway('{"action":"setup","email":"review@example.test","setupKey":"fixture-setup-key","password":"review-password-only"}'); assert auth->>'ok'='true','setup succeeds';token:=auth->>'token';
  r:=public.lumentia_gateway('{"action":"setup","email":"review@example.test","setupKey":"fixture-setup-key","password":"review-password-only"}'); assert r->>'ok'='false','setup single use';
  r:=public.lumentia_gateway('{"action":"login","email":"student@example.test","password":"review-password-only"}'); assert r->>'ok'='false','wrong identity denied';
  r:=public.lumentia_gateway('{"action":"login","email":"review@example.test","password":"wrong"}'); assert r->>'ok'='false','wrong password denied';
  r:=public.lumentia_gateway('{"action":"login","email":"review@example.test","password":"review-password-only"}'); assert r->>'ok'='true','teacher login';
  base:=jsonb_build_object('action','sync','studentId',sid,'secret',secret,'name','검증학생','records',jsonb_build_array(jsonb_build_object('id','REVIEW-ONE','date',day,'amount',1200,'t',ts,'paid',1200,'receivedAt',ts,'requestedAt',ts)));
  r:=public.lumentia_gateway(base); assert r->>'ok'='true','student sync';row:=r->'records'->0;claim_id:=row->>'id';
  assert row->>'paid'='0' and row->>'status'='requested','student cannot set received or paid';
  r:=public.lumentia_gateway(jsonb_build_object('action','list','token',secret));assert r->>'ok'='false','student cannot list classmates';
  r:=public.lumentia_gateway(base||jsonb_build_object('secret',repeat('2',64)));assert r->>'ok'='false','wrong student secret denied';
  r:=public.lumentia_gateway(jsonb_build_object('action','pay','token',token,'claimId',claim_id,'requestId',gen_random_uuid(),'revision',0,'amount',500));assert r->>'ok'='false','receipt required';
  r:=public.lumentia_gateway(jsonb_build_object('action','receive','token',token,'claimId',claim_id,'requestId',gen_random_uuid(),'revision',0,'receivedAt',ts));assert r->>'ok'='true','teacher receipt';
  req:=gen_random_uuid();r:=public.lumentia_gateway(jsonb_build_object('action','pay','token',token,'claimId',claim_id,'requestId',req,'revision',1,'amount',500));
  assert r->'record'->>'remaining'='700' and r->'record'->>'paid'='500','partial payment';
  r:=public.lumentia_gateway(jsonb_build_object('action','pay','token',token,'claimId',claim_id,'requestId',req,'revision',1,'amount',500));assert r->>'duplicate'='true' and r->'record'->>'paid'='500','idempotent retry';
  r:=public.lumentia_gateway(jsonb_build_object('action','pay','token',token,'claimId',claim_id,'requestId',req,'revision',2,'amount',700));assert r->>'code'='409','idempotency mismatch denied';
  r:=public.lumentia_gateway(jsonb_build_object('action','pay','token',token,'claimId',claim_id,'requestId',gen_random_uuid(),'revision',1,'amount',700));assert r->>'code'='409','stale tab denied';
  r:=public.lumentia_gateway(jsonb_build_object('action','pay','token',token,'claimId',claim_id,'requestId',gen_random_uuid(),'amount',700));assert r->>'code'='400','missing revision denied';
  r:=public.lumentia_gateway(jsonb_build_object('action','pay','token',token,'claimId',claim_id,'requestId',gen_random_uuid(),'revision',2,'amount',701));assert r->>'ok'='false','overpayment denied';
  r:=public.lumentia_gateway(jsonb_build_object('action','pay','token',token,'claimId',claim_id,'requestId',gen_random_uuid(),'revision',2,'amount',700));assert r->'record'->>'remaining'='0' and r->'record'->>'paid'='1200','final payment';
  r:=public.lumentia_gateway(base);assert r->'records'->0->>'remaining'='0' and r->'records'->0->>'amount'='1200','stale import cannot resurrect payment, earned retained';
  r:=public.lumentia_gateway(jsonb_set(base,'{records,0,amount}','5000'));assert jsonb_array_length(r->'rejected')=1 and r->'records'->0->>'amount'='1200','immutable settlement amount';
  r:=public.lumentia_gateway(jsonb_set(base,'{records}',jsonb_build_array(jsonb_build_object('id','REVIEW-TWO','date',day,'amount',18800,'t',ts))));assert jsonb_array_length(r->'rejected')=0,'second challenge reaches daily cap';
  r:=public.lumentia_gateway(jsonb_set(base,'{records}',jsonb_build_array(jsonb_build_object('id','REVIEW-THREE','date',day,'amount',1,'t',ts))));assert jsonb_array_length(r->'rejected')=1,'third challenge/day cap denied';
  ts:=floor(extract(epoch from now()-interval '73 hours')*1000);day:=to_char((now()-interval '73 hours') at time zone 'Asia/Seoul','YYYY-MM-DD');
  base:=jsonb_build_object('action','sync','studentId',sid2,'secret',secret,'name','만료검증','records',jsonb_build_array(jsonb_build_object('id','REVIEW-EXPIRED','date',day,'amount',200,'t',ts,'requestedAt',ts)));
  r:=public.lumentia_gateway(base);row:=r->'records'->0;claim_id:=row->>'id';assert row->>'status'='expired' and row->>'remaining'='0','unconfirmed expires despite student assertion';
  r:=public.lumentia_gateway(jsonb_build_object('action','receive','token',token,'claimId',claim_id,'requestId',gen_random_uuid(),'revision',0,'receivedAt',ts+72*3600000));assert r->>'ok'='false','exact expiry receipt denied';
  r:=public.lumentia_gateway(jsonb_build_object('action','receive','token',token,'claimId',claim_id,'requestId',gen_random_uuid(),'revision',0,'receivedAt',ts+1000));assert r->'record'->>'status'='received' and r->'record'->>'remaining'='200','teacher can verify timely historical receipt';
  r:=public.lumentia_gateway(jsonb_build_object('action','list','token',token));assert jsonb_array_length(r->'records')=3 and jsonb_array_length(r->'audit')=4,'teacher list and audit';
  r:=public.lumentia_gateway(jsonb_build_object('action','logout','token',token));assert r->>'ok'='true','logout';
  r:=public.lumentia_gateway(jsonb_build_object('action','list','token',token));assert r->>'code'='401','revoked session denied';
  assert not has_function_privilege('anon','public.lumentia_gateway(jsonb)','execute'),'anon RPC denied';
  assert not has_function_privilege('authenticated','public.lumentia_gateway(jsonb)','execute'),'authenticated RPC denied';
end $$;
rollback;
select '32 ledger assertions passed; all synthetic records rolled back' as result;
