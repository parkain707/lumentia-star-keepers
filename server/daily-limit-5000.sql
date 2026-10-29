create or replace function lumentia_private.gateway(p jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  a text := p->>'action'; ip text := coalesce(p->>'ip','unknown');
  t lumentia_private.teacher; s lumentia_private.students; c lumentia_private.claims;
  old_audit lumentia_private.audit;
  tok text; sid uuid; raw jsonb; rid text; d date; n integer; ts timestamptz; recv timestamptz;
  v_request_id uuid; result jsonb; rows jsonb := '[]'; rejects jsonb := '[]';
begin
  if a='status' then
    return jsonb_build_object('ok',true,'configured',exists(select 1 from lumentia_private.teacher where password_hash is not null),'serverTime',extract(epoch from now())*1000);
  end if;
  if a in ('setup','login') then
    if lumentia_private.limited('auth-ip:'||ip,10,900) or lumentia_private.limited('auth-global',100,900) then
      return jsonb_build_object('ok',false,'error','잠시 후 다시 로그인해 주세요.','code',429);
    end if;
    select * into t from lumentia_private.teacher where singleton for update;
    if lower(trim(coalesce(p->>'email',''))) <> t.email or t.email is null then
      return jsonb_build_object('ok',false,'error','로그인 정보를 확인해 주세요.','code',401);
    end if;
    if a='setup' then
      if t.password_hash is not null or t.setup_hash is null or
        encode(extensions.digest(coalesce(p->>'setupKey',''),'sha256'),'hex') <> t.setup_hash then
        return jsonb_build_object('ok',false,'error','설정 키가 올바르지 않거나 이미 사용되었습니다.','code',401);
      end if;
      if length(coalesce(p->>'password','')) < 12 or octet_length(p->>'password') > 72 then
        return jsonb_build_object('ok',false,'error','비밀번호는 12자 이상, UTF-8 72바이트 이하로 설정해 주세요.','code',400);
      end if;
      update lumentia_private.teacher set password_hash=extensions.crypt(p->>'password',extensions.gen_salt('bf',12)),setup_hash=null,configured_at=now() where singleton;
    elsif t.password_hash is null or octet_length(coalesce(p->>'password',''))>72 or
      extensions.crypt(coalesce(p->>'password',''),t.password_hash) <> t.password_hash then
      return jsonb_build_object('ok',false,'error','로그인 정보를 확인해 주세요.','code',401);
    end if;
    tok := encode(extensions.gen_random_bytes(32),'hex');
    delete from lumentia_private.sessions where expires_at < now();
    insert into lumentia_private.sessions values(encode(extensions.digest(tok,'sha256'),'hex'),now()+interval '8 hours');
    return jsonb_build_object('ok',true,'token',tok,'email',t.email,'expiresAt',extract(epoch from now()+interval '8 hours')*1000);
  end if;

  if a='sync' then
    if coalesce(p->>'secret','') !~ '^[a-f0-9]{64}$' or coalesce(p->>'studentId','') !~ '^[a-f0-9-]{36}$' or
      length(coalesce(p->>'name','')) not between 2 and 12 or jsonb_typeof(p->'records') <> 'array' or jsonb_array_length(p->'records')>180 then
      return jsonb_build_object('ok',false,'error','학생 기록 형식이 올바르지 않습니다.','code',400);
    end if;
    sid := (p->>'studentId')::uuid;
    perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
    select * into s from lumentia_private.students where id=sid for update;
    if not found then
      if lumentia_private.limited('enroll:'||ip,300,3600) then return jsonb_build_object('ok',false,'error','등록 요청이 많습니다. 잠시 후 다시 시도하세요.','code',429); end if;
      insert into lumentia_private.students(id,token_hash,name) values(sid,encode(extensions.digest(p->>'secret','sha256'),'hex'),p->>'name');
    elsif s.token_hash <> encode(extensions.digest(p->>'secret','sha256'),'hex') then
      return jsonb_build_object('ok',false,'error','학생 보상 연결 정보가 일치하지 않습니다.','code',401);
    end if;
    update lumentia_private.students set seen_at=now() where id=sid;
    for raw in select value from jsonb_array_elements(p->'records') loop
      begin
        rid := raw->>'id'; d := (raw->>'date')::date; n := (raw->>'amount')::integer;
        ts := to_timestamp((raw->>'t')::numeric/1000);
        if rid is null or length(rid) not between 1 and 100 or n not between 1 and 20000 or
          ts>now()+interval '5 minutes' or ts<now()-interval '90 days' or d>(ts at time zone 'Asia/Seoul')::date or d<(now() at time zone 'Asia/Seoul')::date-90 then
          rejects := rejects || jsonb_build_array(coalesce(rid,'invalid')); continue;
        end if;
        select * into c from lumentia_private.claims where student_id=sid and settlement_id=rid;
        if not found then
          if (select count(*)>=2 or coalesce(sum(amount),0)+n>case when d>=date '2026-10-30' then 5000 else 20000 end from lumentia_private.claims where student_id=sid and reward_day=d) then
            rejects := rejects || jsonb_build_array(rid); continue;
          end if;
          insert into lumentia_private.claims(student_id,settlement_id,reward_day,amount,settled_at,expires_at)
            values(sid,rid,d,n,ts,ts+interval '72 hours') returning * into c;
        elsif c.amount<>n or c.reward_day<>d or abs(extract(epoch from c.settled_at-ts))>1 then
          rejects := rejects || jsonb_build_array(rid); continue;
        end if;
        -- A student's assertion never grants teacher receipt or payment authority.
        if coalesce((raw->>'requestedAt')::numeric,0)>0 and now()<c.expires_at and c.requested_at is null then
          update lumentia_private.claims set requested_at=now() where id=c.id;
        end if;
      exception when invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow then
        rejects := rejects || jsonb_build_array(coalesce(rid,'invalid'));
      end;
    end loop;
    perform lumentia_private.allocate_prior(sid);
    select coalesce(jsonb_agg(lumentia_private.claim_json(x) order by x.settled_at),'[]') into rows from lumentia_private.claims x where x.student_id=sid;
    return jsonb_build_object('ok',true,'studentId',sid,'records',rows,'rejected',rejects,'serverTime',extract(epoch from now())*1000);
  end if;

  -- Every remaining action requires a server-issued, unexpired teacher session.
  if coalesce(p->>'token','') !~ '^[a-f0-9]{64}$' or not exists(select 1 from lumentia_private.sessions where token_hash=encode(extensions.digest(p->>'token','sha256'),'hex') and expires_at>now()) then
    return jsonb_build_object('ok',false,'error','선생님 로그인이 필요합니다.','code',401);
  end if;
  if a='logout' then
    delete from lumentia_private.sessions where token_hash=encode(extensions.digest(p->>'token','sha256'),'hex');
    return jsonb_build_object('ok',true);
  end if;
  if a='list' then
    select coalesce(jsonb_agg(lumentia_private.claim_json(x)||jsonb_build_object('studentName',st.name) order by x.settled_at desc),'[]') into rows
      from lumentia_private.claims x join lumentia_private.students st on st.id=x.student_id;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]') into result from lumentia_private.audit x;
    return jsonb_build_object('ok',true,'records',rows,'audit',result,
      'priorPayments',(select coalesce(jsonb_agg(to_jsonb(pp) order by pp.paid_at),'[]') from lumentia_private.prior_payments pp),
      'priorAllocations',(select coalesce(jsonb_agg(to_jsonb(pa)),'[]') from lumentia_private.prior_allocations pa),
      'students',(select coalesce(jsonb_agg(jsonb_build_object('id',st.id,'name',st.name)),'[]') from lumentia_private.students st),
      'serverTime',extract(epoch from now())*1000);
  end if;
  if a='bind_prior' then
    sid:=(p->>'studentId')::uuid;
    perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
    if not exists(select 1 from lumentia_private.students st where st.id=sid) then return jsonb_build_object('ok',false,'error','연결할 학생을 찾을 수 없습니다.','code',404); end if;
    update lumentia_private.prior_payments set student_id=sid where id=(p->>'priorId')::uuid and student_id is null;
    if not found then return jsonb_build_object('ok',false,'error','이미 연결되었거나 존재하지 않는 지급 내역입니다.','code',409); end if;
    perform lumentia_private.allocate_prior(sid);
    return jsonb_build_object('ok',true);
  end if;
  if a in ('receive','pay') then
    if coalesce(p->>'requestId','') !~ '^[a-f0-9-]{36}$' or coalesce(p->>'claimId','') !~ '^[a-f0-9-]{36}$' or coalesce(p->>'revision','') !~ '^[0-9]+$' then
      return jsonb_build_object('ok',false,'error','최신 정산 번호와 요청 번호가 필요합니다.','code',400);
    end if;
    v_request_id := (p->>'requestId')::uuid;
    select * into c from lumentia_private.claims where id=(p->>'claimId')::uuid for update;
    if not found then return jsonb_build_object('ok',false,'error','정산 내역을 찾을 수 없습니다.','code',404); end if;
    select * into old_audit from lumentia_private.audit where audit.request_id=v_request_id;
    if found then
      if old_audit.claim_id<>c.id or old_audit.action<>a or (a='pay' and old_audit.amount<>(p->>'amount')::integer) or (a='receive' and old_audit.received_at<>to_timestamp((p->>'receivedAt')::numeric/1000)) then
        return jsonb_build_object('ok',false,'error','같은 요청 번호를 다른 처리에 사용할 수 없습니다.','code',409);
      end if;
      return jsonb_build_object('ok',true,'record',lumentia_private.claim_json(c),'duplicate',true);
    end if;
    if c.revision<>(p->>'revision')::integer then return jsonb_build_object('ok',false,'error','내역이 변경되었습니다. 새로고침 후 확인하세요.','code',409); end if;
    if a='receive' then
      recv := to_timestamp((p->>'receivedAt')::numeric/1000);
      if recv is null or recv<c.settled_at or recv>=c.expires_at or recv>now() then return jsonb_build_object('ok',false,'error','클래스톡 수신 시각은 수령 확정 후 72시간 이내여야 합니다.','code',400); end if;
      if c.received_at is not null then return jsonb_build_object('ok',false,'error','이미 수신 확인한 정산입니다.','code',409); end if;
      update lumentia_private.claims set received_at=recv,revision=revision+1 where id=c.id returning * into c;
      n := 0;
    else
      n := (p->>'amount')::integer;
      if c.received_at is null or n is null or n<1 or n>c.amount-c.paid then return jsonb_build_object('ok',false,'error','수신 확인 후 남은 금액 안에서 지급해 주세요.','code',400); end if;
      update lumentia_private.claims set paid=paid+n,revision=revision+1 where id=c.id returning * into c;
    end if;
    insert into lumentia_private.audit(request_id,claim_id,action,amount,received_at,actor,note)
      select v_request_id,c.id,a,n,case when a='receive' then recv else null end,email,left(coalesce(p->>'note',''),200) from lumentia_private.teacher;
    return jsonb_build_object('ok',true,'record',lumentia_private.claim_json(c));
  end if;
  return jsonb_build_object('ok',false,'error','지원하지 않는 요청입니다.','code',400);
end $$;

