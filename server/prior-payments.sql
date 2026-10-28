-- Teacher-verified payments made before the ledger was introduced.
create table lumentia_private.prior_payments (
  id uuid primary key default gen_random_uuid(),
  student_name text not null,
  student_id uuid references lumentia_private.students(id),
  reward_day date not null,
  amount integer not null check(amount between 1 and 20000),
  paid_at timestamptz not null,
  allocated integer not null default 0 check(allocated>=0 and allocated<=amount),
  source text not null,
  recorded_at timestamptz not null default now(),
  unique(student_name,reward_day,source)
);
create table lumentia_private.prior_allocations (
  id uuid primary key default gen_random_uuid(),
  prior_id uuid not null references lumentia_private.prior_payments(id),
  claim_id uuid not null references lumentia_private.claims(id),
  amount integer not null check(amount>0),
  created_at timestamptz not null default now()
);
create index prior_student_day on lumentia_private.prior_payments(student_id,reward_day);
create index prior_allocations_claim on lumentia_private.prior_allocations(claim_id);
alter table lumentia_private.prior_payments enable row level security;
alter table lumentia_private.prior_allocations enable row level security;
revoke all on lumentia_private.prior_payments,lumentia_private.prior_allocations from public,anon,authenticated;
grant select,insert,update on lumentia_private.prior_payments to service_role;
grant select,insert on lumentia_private.prior_allocations to service_role;

create function lumentia_private.allocate_prior(sid uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare pr lumentia_private.prior_payments; c lumentia_private.claims; n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(sid::text,0));
  -- Exact unique names only. Different nicknames require explicit teacher linking.
  update lumentia_private.prior_payments pp set student_id=sid
    where pp.student_id is null and pp.student_name=(select st.name from lumentia_private.students st where st.id=sid)
      and (select count(*) from lumentia_private.students st where st.name=pp.student_name)=1;
  for pr in select * from lumentia_private.prior_payments where student_id=sid and allocated<amount order by paid_at,id for update loop
    for c in select * from lumentia_private.claims where student_id=sid and reward_day=pr.reward_day and paid<amount order by settled_at,id for update loop
      n:=least(pr.amount-pr.allocated,c.amount-c.paid);
      exit when n<=0;
      update lumentia_private.claims set paid=paid+n,revision=revision+1 where id=c.id;
      insert into lumentia_private.prior_allocations(prior_id,claim_id,amount) values(pr.id,c.id,n);
      update lumentia_private.prior_payments set allocated=allocated+n where id=pr.id;
      pr.allocated:=pr.allocated+n;
    end loop;
  end loop;
end $$;
revoke all on function lumentia_private.allocate_prior(uuid) from public,anon,authenticated;
grant execute on function lumentia_private.allocate_prior(uuid) to service_role;
