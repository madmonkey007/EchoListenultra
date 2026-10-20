-- Run as project owner. Service-role RPC only: browser roles have no access.
create schema if not exists echo_private;
revoke all on schema echo_private from public, anon, authenticated;
create table if not exists echo_private.quota_jobs (
  subject text not null, request_id uuid not null, authenticated boolean not null,
  network text not null, seconds integer not null check(seconds > 0),
  state text not null check(state in ('reserved','succeeded','failed','expired')),
  created_at timestamptz not null default now(), expires_at timestamptz not null,
  primary key(subject, request_id)
);
create table if not exists echo_private.quota_requests (
  network text not null, minute timestamptz not null, requests integer not null,
  primary key(network,minute)
);
create table if not exists echo_private.quota_control (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into echo_private.quota_control(singleton,enabled) values(true,false) on conflict do nothing;
create index if not exists quota_jobs_subject_created on echo_private.quota_jobs(subject,created_at);
create index if not exists quota_jobs_network_created on echo_private.quota_jobs(network,created_at);
create index if not exists quota_jobs_created on echo_private.quota_jobs(created_at);
create index if not exists quota_jobs_expiry on echo_private.quota_jobs(expires_at) where state='reserved';
alter table echo_private.quota_jobs enable row level security;
alter table echo_private.quota_requests enable row level security;
alter table echo_private.quota_control enable row level security;

create or replace function public.echo_quota_status(p_subject text, p_authenticated boolean, p_network text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n integer; sec integer; ipn integer; start_at timestamptz := date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_subject is null or p_authenticated is null or p_network is null then raise exception 'invalid_request'; end if;
  -- Shared global lock serializes reserve/settle/status snapshots. Small initial deployment.
  perform pg_advisory_xact_lock(852741963);
  update echo_private.quota_jobs set state='expired' where state='reserved' and expires_at <= now();
  select coalesce(sum(1),0),coalesce(sum(seconds),0) into n,sec from echo_private.quota_jobs
   where subject=p_subject and state in ('succeeded','reserved') and (not p_authenticated or created_at>=start_at);
  -- Cookie clearing cannot bypass the anonymous network ceiling (2 successes/reservations/day).
  select count(*) into ipn from echo_private.quota_jobs where network=p_network and not authenticated
    and state in ('succeeded','reserved') and created_at>=start_at;
  return jsonb_build_object('remainingRequests', greatest(0,case when p_authenticated then 3-n else least(2-n,2-ipn) end),
    'remainingSeconds', greatest(0,case when p_authenticated then 1200 else 600 end-sec),
    'resetAt',case when p_authenticated then to_jsonb(start_at+interval '1 day') else 'null'::jsonb end);
end $$;

create or replace function public.echo_quota_reserve(p_subject text,p_authenticated boolean,p_network text,p_request_id uuid,p_seconds integer,p_global_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing echo_private.quota_jobs; usage jsonb; total integer; attempts integer; start_at timestamptz := date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
begin
 perform pg_advisory_xact_lock(852741963);
 if not exists(select 1 from echo_private.quota_control where singleton=true and enabled=true) then return jsonb_build_object('ok',false,'reason','platform_disabled'); end if;
 if p_subject is null or p_authenticated is null or p_network is null or p_request_id is null or p_seconds is null or p_global_limit is null
   or p_seconds<1 or p_seconds>(case when p_authenticated then 600 else 300 end) or p_global_limit<1
   or p_subject !~ '^(anon|user):[a-f0-9-]{36}$' or length(p_network)<>43
   or (p_authenticated and p_subject not like 'user:%') or (not p_authenticated and p_subject not like 'anon:%')
 then return jsonb_build_object('ok',false,'reason','invalid_request'); end if;
 usage := public.echo_quota_status(p_subject,p_authenticated,p_network);
 select * into existing from echo_private.quota_jobs where subject=p_subject and request_id=p_request_id;
 if found then
   return jsonb_build_object('ok',existing.state in ('reserved','succeeded'),'state',existing.state,'idempotent',true);
 end if;
 insert into echo_private.quota_requests(network,minute,requests) values(p_network,date_trunc('minute',now()),1)
 on conflict(network,minute) do update set requests=echo_private.quota_requests.requests+1 returning requests into attempts;
 if attempts>10 then return jsonb_build_object('ok',false,'reason','rate_limited'); end if;
 -- Both account and network get one active job at a time, including failed/retrying clients.
 if exists(select 1 from echo_private.quota_jobs where state='reserved' and (subject=p_subject or network=p_network)) then return jsonb_build_object('ok',false,'reason','busy'); end if;
 if (usage->>'remainingRequests')::int<1 or (usage->>'remainingSeconds')::int<p_seconds then return jsonb_build_object('ok',false,'reason','quota_exhausted'); end if;
 select coalesce(sum(seconds),0) into total from echo_private.quota_jobs where created_at>=start_at;
 if total+p_seconds>p_global_limit then return jsonb_build_object('ok',false,'reason','daily_budget_exhausted'); end if;
 insert into echo_private.quota_jobs(subject,request_id,authenticated,network,seconds,state,expires_at)
 values(p_subject,p_request_id,p_authenticated,p_network,p_seconds,'reserved',now()+interval '30 minutes');
 return jsonb_build_object('ok',true,'state','reserved','idempotent',false);
end $$;

create or replace function public.echo_quota_settle(p_subject text,p_request_id uuid,p_succeeded boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job echo_private.quota_jobs;
begin
 if p_subject is null or p_request_id is null or p_succeeded is null then return jsonb_build_object('ok',false,'reason','invalid_request'); end if;
 perform pg_advisory_xact_lock(852741963);
 select * into job from echo_private.quota_jobs where subject=p_subject and request_id=p_request_id for update;
 if not found then return jsonb_build_object('ok',false,'reason','unknown_reservation'); end if;
 if job.state<>'reserved' then return jsonb_build_object('ok',job.state='succeeded','state',job.state,'idempotent',true); end if;
 -- A worker must finish within the lease; expired work must never be delivered or charged.
 update echo_private.quota_jobs set state=case when expires_at<=now() then 'expired' when p_succeeded then 'succeeded' else 'failed' end
 where subject=p_subject and request_id=p_request_id returning * into job;
 return jsonb_build_object('ok',job.state='succeeded','state',job.state);
end $$;
revoke all on function public.echo_quota_status(text,boolean,text) from public,anon,authenticated;
revoke all on function public.echo_quota_reserve(text,boolean,text,uuid,integer,integer) from public,anon,authenticated;
revoke all on function public.echo_quota_settle(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.echo_quota_status(text,boolean,text) to service_role;
grant execute on function public.echo_quota_reserve(text,boolean,text,uuid,integer,integer) to service_role;
grant execute on function public.echo_quota_settle(text,uuid,boolean) to service_role;

-- Safe operational cleanup: does not delete accounting/idempotency history.
create or replace function public.echo_quota_cleanup_requests()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
 delete from echo_private.quota_requests where minute < now()-interval '2 days';
 get diagnostics removed = row_count;
 return removed;
end $$;
revoke all on function public.echo_quota_cleanup_requests() from public,anon,authenticated;
grant execute on function public.echo_quota_cleanup_requests() to service_role;
