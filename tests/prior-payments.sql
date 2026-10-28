begin;
do $$
declare r jsonb; base jsonb; sid uuid:=gen_random_uuid(); pp uuid; day text:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'); ts numeric:=extract(epoch from now()-interval '1 minute')*1000;
begin
  insert into lumentia_private.prior_payments(student_name,reward_day,amount,paid_at,source) values('기지급검증',day::date,3775,now(),'synthetic_rollback_only') returning id into pp;
  base:=jsonb_build_object('action','sync','studentId',sid,'secret',repeat('a',64),'name','기지급검증','records',jsonb_build_array(jsonb_build_object('id','PRIOR-ONE','date',day,'amount',1200,'t',ts)));
  r:=public.lumentia_gateway(base);
  assert r->'records'->0->>'remaining'='0' and r->'records'->0->>'paid'='1200','prior partial credit';
  assert (select allocated from lumentia_private.prior_payments where id=pp)=1200,'credit tracked';
  r:=public.lumentia_gateway(base);assert (select allocated from lumentia_private.prior_payments where id=pp)=1200,'sync does not debit twice';
  base:=jsonb_set(base,'{records}',jsonb_build_array(jsonb_build_object('id','PRIOR-TWO','date',day,'amount',3000,'t',ts+1)));
  r:=public.lumentia_gateway(base);assert (select paid from lumentia_private.claims where student_id=sid and settlement_id='PRIOR-TWO')=2575,'only remaining prior credit applied';
  assert (select allocated from lumentia_private.prior_payments where id=pp)=3775,'exact 3775 fully allocated';
  assert (select sum(paid) from lumentia_private.claims where student_id=sid)=3775,'no invented payment';
  base:=jsonb_set(base,'{records}',jsonb_build_array(jsonb_build_object('id','PRIOR-OTHER-DAY','date',to_char((now()-interval '1 day') at time zone 'Asia/Seoul','YYYY-MM-DD'),'amount',500,'t',ts-86400000)));
  r:=public.lumentia_gateway(base);assert (select paid from lumentia_private.claims where student_id=sid and settlement_id='PRIOR-OTHER-DAY')=0,'other day unaffected';
  assert (select sum(amount) from lumentia_private.prior_allocations where prior_id=pp)=3775,'immutable allocation trail';
end $$;
rollback;
select '8 prior-payment assertions passed; synthetic records rolled back' as result;
