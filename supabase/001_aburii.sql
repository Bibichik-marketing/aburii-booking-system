-- Run ONLY in a newly created, empty Aburii Supabase project.
-- Every privilege change is atomic with schema creation. No customer data is seeded.
begin;
create schema aburii;
revoke all on schema aburii from public,anon,authenticated;
create table aburii.settings (
 id boolean primary key default true check(id), version integer not null default 1,
 config jsonb not null
);
insert into aburii.settings(config) values ('{
 "counter":{"enabled":false,"capacity":0,"min":1,"max":1,"duration":120,"minimumSpend":0},
 "private":{"enabled":false,"capacity":0,"min":1,"max":1,"duration":120,"minimumSpend":0},
 "rooms":[],"noticeMinutes":120,"advanceDays":30,"holdMinutes":30,"services":[],"closures":[]
}');
create table aburii.staff (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('admin','manager','staff')),active boolean not null default true
);
create table aburii.bookings (
 id uuid primary key, reference text unique not null default ('AB-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 area text not null check(area in ('counter','private')), room text,
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 guests integer not null check(guests between 1 and 200),
 name text not null check(length(name) between 2 and 100),
 phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),email text not null default '' check(length(email)<=254),
 requests text not null default '' check(length(requests)<=1000),
 status text not null default 'pending' check(status in ('pending','confirmed','seated','completed','cancelled','declined','no_show','expired')),
 expires_at timestamptz not null, capacity_released_at timestamptz, consent_at timestamptz not null default clock_timestamp(),policy_version text not null default '2026-11-draft',
 whatsapp boolean not null default false,minimum_spend numeric not null default 0,
 request_hash text not null, created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 check((area='counter' and room is null) or (area='private' and room is not null))
);
create index on aburii.bookings(starts_at,ends_at) where capacity_released_at is null;
create index on aburii.bookings(room,starts_at,ends_at) where area='private' and capacity_released_at is null;
create table aburii.audit (
 id bigint generated always as identity primary key,actor uuid,event text not null,booking_id uuid,details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create table aburii.outbox (
 id uuid primary key default gen_random_uuid(),booking_id uuid not null references aburii.bookings(id),event text not null,
 payload jsonb not null,attempts integer not null default 0,available_at timestamptz not null default clock_timestamp(),
 lease uuid,delivered_at timestamptz,discarded_at timestamptz,last_error text,unique(booking_id,event)
);
create table aburii.rates (key text primary key,window_start timestamptz not null,count integer not null);
alter table aburii.settings enable row level security;
alter table aburii.staff enable row level security;
alter table aburii.bookings enable row level security;
alter table aburii.audit enable row level security;
alter table aburii.outbox enable row level security;
alter table aburii.rates enable row level security;
revoke all on all tables in schema aburii from public,anon,authenticated,service_role;
revoke all on all sequences in schema aburii from public,anon,authenticated,service_role;

create function aburii.role() returns text language plpgsql security definer set search_path='' as $$
declare r text;
begin
 select role into r from aburii.staff where user_id=auth.uid() and active;
 if r is null then raise exception 'Staff access required' using errcode='42501';end if;
 return r;
end $$;

-- Expiry is logical even without cron. Only holds expiring BEFORE start release capacity.
-- Once start is reached, any unreleased commitment lasts through the original interval.
-- Wall-clock decisions are evaluated after acquiring locks, not at transaction start.
-- Mutation paths also materialize expired status while holding the single restaurant lock.
create function aburii.expire() returns void language plpgsql set search_path='' as $$
declare b aburii.bookings;
begin
 for b in update aburii.bookings set status='expired',updated_at=clock_timestamp(),capacity_released_at=case when expires_at<starts_at then expires_at else null end where status='pending' and expires_at<=clock_timestamp() returning * loop
  perform aburii.notify(b,'expired');
 end loop;
end $$;
create function aburii.active(b aburii.bookings) returns boolean language sql volatile set search_path='' as $$
 select b.capacity_released_at is null and (
  b.status in ('confirmed','seated','completed')
  or (b.status='pending' and (b.expires_at>clock_timestamp() or (b.expires_at>=b.starts_at and clock_timestamp()>=b.starts_at)))
  or (b.status='expired' and b.expires_at>=b.starts_at and clock_timestamp()>=b.starts_at)
  or (b.status in ('cancelled','declined','no_show') and clock_timestamp()>=b.starts_at)
 );
$$;

-- Counter uses peak occupancy across the requested interval, not SUM of all overlaps.
-- Intervals are half-open [start,end); back-to-back reservations are allowed.
create function aburii.capacity(c jsonb,a text,s timestamptz,e timestamptz,g integer,exclude_id uuid default null)
returns jsonb language plpgsql volatile set search_path='' as $$
declare room_id text; peak integer;
begin
 if a='counter' then
  select coalesce(max(used),0) into peak from (
   select sum(delta) over(order by point rows unbounded preceding) used from (
    select point,sum(delta) delta from (
     select greatest(b.starts_at,s) point,b.guests delta from aburii.bookings b
     where b.area='counter' and aburii.active(b) and b.id is distinct from exclude_id and b.starts_at<e and b.ends_at>s
     union all
     select least(b.ends_at,e),-b.guests from aburii.bookings b
     where b.area='counter' and aburii.active(b) and b.id is distinct from exclude_id and b.starts_at<e and b.ends_at>s
    ) events group by point
   ) grouped
  ) occupancy;
  return jsonb_build_object('available',peak+g<=(c->'counter'->>'capacity')::integer,'room',null);
 end if;
 select r->>'id' into room_id from jsonb_array_elements(c->'rooms') r
 where (r->>'enabled')::boolean and (r->>'capacity')::integer>=g
 and not exists(select 1 from aburii.bookings b where b.room=r->>'id' and b.area='private' and aburii.active(b)
  and b.id is distinct from exclude_id and b.starts_at<e and b.ends_at>s)
 order by (r->>'capacity')::integer,r->>'id' limit 1;
 return jsonb_build_object('available',room_id is not null,'room',room_id);
end $$;

create function aburii.slots(c jsonb,d date,a text,g integer)
returns table(starts_at timestamptz,ends_at timestamptz) language sql volatile set search_path='' as $$
 with services as (
 select v from jsonb_array_elements(c->'services') v where v->>'area'=a
 ), chosen as (
 select v from services where case when exists(select 1 from services where v->>'date'=d::text)
 then v->>'date'=d::text else (v->>'day')::integer=extract(dow from d)::integer end
 ), times as (
 select distinct (d::text||'T'||t||':00+08:00')::timestamptz s
 from chosen cross join lateral jsonb_array_elements_text(v->'times') t
 ), intervals as (
 select s,s+make_interval(mins=>(c->a->>'duration')::integer) e from times
 )
 select s,e from intervals where (c->a->>'enabled')::boolean
 and g between (c->a->>'min')::integer and (c->a->>'max')::integer
 and s>=clock_timestamp()+make_interval(mins=>(c->>'noticeMinutes')::integer)
 and d<=(clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date+(c->>'advanceDays')::integer
 and not exists(select 1 from jsonb_array_elements(c->'closures') x
 where x->>'area' in (a,'all') and (x->>'start')::timestamptz<e and (x->>'end')::timestamptz>s);
$$;

create function public.aburii_availability(p_date date,p_area text,p_guests integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; result jsonb;
begin
 if p_area not in ('counter','private') or p_guests not between 1 and 200 or p_date is null then raise exception 'Invalid request';end if;
 select config into c from aburii.settings where id;
 select coalesce(jsonb_agg(jsonb_build_object('start',s.starts_at,'end',s.ends_at) order by s.starts_at),'[]') into result
 from aburii.slots(c,p_date,p_area,p_guests) s
 where (aburii.capacity(c,p_area,s.starts_at,s.ends_at,p_guests)->>'available')::boolean;
 return jsonb_build_object('slots',result,'minimumSpend',c->p_area->'minimumSpend','holdMinutes',c->'holdMinutes');
end $$;

create function aburii.notify(b aburii.bookings,event text) returns void language sql set search_path='' as $$
 insert into aburii.outbox(booking_id,event,payload)
 select b.id,event,jsonb_build_object('phone',b.phone,'reference',b.reference,'status',event,'start',b.starts_at,'area',b.area,'guests',b.guests)
 where b.whatsapp on conflict(booking_id,event) do nothing;
$$;

create function public.aburii_book(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; b aburii.bookings; s timestamptz;e timestamptz;g integer;a text;alloc jsonb;h text;
begin
 -- Row lock serializes every booking, reassignment, status and configuration mutation.
 select config into c from aburii.settings where id for update;
 perform aburii.expire();
 if p->>'consent' is distinct from 'true' or p->>'area' not in ('counter','private')
 or p->>'name' is null or p->>'phone' is null or p->>'email' is null or p->>'requests' is null
 or jsonb_typeof(p->'whatsapp') is distinct from 'boolean'
 then raise exception 'Invalid request';end if;
 h=md5(p::text);
 select * into b from aburii.bookings where id=(p->>'id')::uuid;
 if found then
  if b.request_hash<>h then raise exception 'Request ID reused';end if;
  return jsonb_build_object('area',b.area,'guests',b.guests,'reference',b.reference,'status',b.status,'expiresAt',b.expires_at,'start',b.starts_at,'end',b.ends_at,'minimumSpend',b.minimum_spend);
 end if;
 s=(p->>'start')::timestamptz;g=(p->>'guests')::integer;a=p->>'area';
 select x.ends_at into e from aburii.slots(c,(s at time zone 'Asia/Kuala_Lumpur')::date,a,g) x where x.starts_at=s;
 if e is null then raise exception 'No availability';end if;
 alloc=aburii.capacity(c,a,s,e,g);
 if not (alloc->>'available')::boolean then raise exception 'No availability';end if;
 insert into aburii.bookings(id,area,room,starts_at,ends_at,guests,name,phone,email,requests,expires_at,whatsapp,request_hash,minimum_spend)
 values((p->>'id')::uuid,a,alloc->>'room',s,e,g,trim(p->>'name'),p->>'phone',p->>'email',p->>'requests',least(clock_timestamp()+make_interval(mins=>(c->>'holdMinutes')::integer),s),(p->>'whatsapp')::boolean,h,(c->a->>'minimumSpend')::numeric)
 returning * into b;
 insert into aburii.audit(event,booking_id) values('booking_requested',b.id);
 perform aburii.notify(b,'pending');
 return jsonb_build_object('area',b.area,'guests',b.guests,'reference',b.reference,'status',b.status,'expiresAt',b.expires_at,'start',b.starts_at,'end',b.ends_at,'minimumSpend',b.minimum_spend);
end $$;

create function public.aburii_staff_data() returns jsonb language plpgsql security definer set search_path='' as $$
declare r text;result jsonb;
begin
 r=aburii.role();
 select jsonb_build_object('role',r,'version',s.version,'config',s.config,
 'bookings',coalesce((select jsonb_agg(to_jsonb(b)-'request_hash' order by b.starts_at) from
 (select b.*, (aburii.active(b) and b.starts_at<=clock_timestamp() and b.ends_at>clock_timestamp()) as capacity_committed from aburii.bookings b where b.starts_at>=clock_timestamp()-interval '7 days' and b.starts_at<=clock_timestamp()+interval '366 days' order by b.starts_at limit 2000) b),'[]'),
 'notifications',case when r in ('admin','manager') then
 (select jsonb_build_object('queued',count(*) filter(where delivered_at is null and discarded_at is null and attempts<8),'failed',count(*) filter(where delivered_at is null and discarded_at is null and attempts>=8)) from aburii.outbox) else '{}'::jsonb end)
 into result from aburii.settings s where s.id;
 return result;
end $$;

create function public.aburii_status(p_id uuid,p_expected text,p_next text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b aburii.bookings;r text;
begin
 r=aburii.role();perform 1 from aburii.settings where id for update;perform aburii.expire();
 select * into b from aburii.bookings where id=p_id for update;
 if not found then raise exception 'Booking not found';end if;
 if b.status<>p_expected then raise exception 'Status changed';end if;
 if not ((b.status='pending' and p_next in ('confirmed','cancelled','declined'))
 or (b.status='confirmed' and p_next in ('seated','cancelled','no_show'))
 or (b.status='seated' and p_next in ('completed','cancelled','no_show'))) then raise exception 'Invalid transition';end if;
 if p_next='seated' and (clock_timestamp()<b.starts_at-interval '30 minutes' or clock_timestamp()>=b.ends_at) then raise exception 'Invalid transition';end if;
 if p_next='no_show' and clock_timestamp()<b.starts_at then raise exception 'Invalid transition';end if;
 update aburii.bookings set status=p_next,updated_at=clock_timestamp(),
 capacity_released_at=case when p_next in ('cancelled','declined') and clock_timestamp()<starts_at then clock_timestamp() else capacity_released_at end
 where id=p_id returning * into b;
 insert into aburii.audit(actor,event,booking_id,details) values(auth.uid(),'status_changed',p_id,jsonb_build_object('from',p_expected,'to',p_next));
 perform aburii.notify(b,p_next);
 return jsonb_build_object('ok',true);
end $$;

create function public.aburii_assign(p_id uuid,p_room text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b aburii.bookings;c jsonb;r text;
begin
 r=aburii.role();select config into c from aburii.settings where id for update;perform aburii.expire();
 select * into b from aburii.bookings where id=p_id for update;
 if not found then raise exception 'Booking not found';end if;
 if b.area<>'private' or b.status not in ('pending','confirmed') or clock_timestamp()>=b.starts_at then raise exception 'Invalid transition';end if;
 if not exists(select 1 from jsonb_array_elements(c->'rooms') x where x->>'id'=p_room and (x->>'enabled')::boolean and (x->>'capacity')::integer>=b.guests)
 or exists(select 1 from aburii.bookings x where x.id<>p_id and x.area='private' and x.room=p_room and aburii.active(x) and x.starts_at<b.ends_at and x.ends_at>b.starts_at)
 then raise exception 'Room unavailable';end if;
 update aburii.bookings set room=p_room,updated_at=clock_timestamp() where id=p_id;
 insert into aburii.audit(actor,event,booking_id,details) values(auth.uid(),'room_assigned',p_id,jsonb_build_object('from',b.room,'to',p_room));
 return jsonb_build_object('ok',true);
end $$;

create function public.aburii_configure(p_config jsonb,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;v integer;a text;x jsonb;r text;
begin
 r=aburii.role();if r<>'admin' then raise exception 'Administrator required' using errcode='42501';end if;
 select config,version into c,v from aburii.settings where id for update;perform aburii.expire();
 if v<>p_version then raise exception 'Status changed';end if;
 -- Database validation applies even if called directly through Supabase REST.
 if p_config is null or jsonb_path_exists(p_config,'$.** ? (@ == null)') or not(p_config ?& array['counter','private','rooms','noticeMinutes','advanceDays','holdMinutes','services','closures'])
 or jsonb_typeof(p_config->'rooms')<>'array' or jsonb_array_length(p_config->'rooms')>100
 or jsonb_typeof(p_config->'services')<>'array' or jsonb_array_length(p_config->'services')>800
 or jsonb_typeof(p_config->'closures')<>'array' or jsonb_array_length(p_config->'closures')>500
 or (p_config->>'noticeMinutes')::integer not between 0 and 43200
 or (p_config->>'advanceDays')::integer not between 1 and 365
 or (p_config->>'holdMinutes')::integer not between 5 and 1440 then raise exception 'Invalid configuration';end if;
 foreach a in array array['counter','private'] loop
  x=p_config->a;
  if not(x ?& array['enabled','capacity','min','max','duration','minimumSpend'])
  or jsonb_typeof(x->'enabled')<>'boolean' or (x->>'capacity')::integer not between 0 and 1000
  or (x->>'min')::integer not between 1 and 200 or (x->>'max')::integer not between (x->>'min')::integer and 200
  or (x->>'duration')::integer not between 15 and 480 or (x->>'minimumSpend')::numeric not between 0 and 100000
  then raise exception 'Invalid configuration';end if;
 end loop;
 for x in select value from jsonb_array_elements(p_config->'rooms') loop
  if not(x ?& array['id','name','capacity','enabled']) or (x->>'id') !~ '^[a-zA-Z0-9_-]{1,40}$'
  or length(x->>'name') not between 1 and 80 or (x->>'capacity')::integer not between 1 and 200 or jsonb_typeof(x->'enabled')<>'boolean'
  then raise exception 'Invalid room';end if;
 end loop;
 if (select count(*)<>count(distinct room_item->>'id') from jsonb_array_elements(p_config->'rooms') room_item) then raise exception 'Duplicate room';end if;
 for x in select value from jsonb_array_elements(p_config->'services') loop
  if x->>'area' not in ('counter','private') or x->>'area' is null or (x ? 'date')=(x ? 'day') or jsonb_typeof(x->'times') is distinct from 'array'
   then raise exception 'Invalid service';end if;
  if x ? 'date' then perform (x->>'date')::date;else if (x->>'day')::integer not between 0 and 6 then raise exception 'Invalid weekday';end if;end if;
  if jsonb_array_length(x->'times')>96 or exists(select 1 from jsonb_array_elements_text(x->'times') t where t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid time';end if;
 end loop;
 for x in select value from jsonb_array_elements(p_config->'closures') loop
  if x->>'area' is null or x->>'area' not in ('all','counter','private') or x->>'start' is null or x->>'end' is null or (x->>'end')::timestamptz<=(x->>'start')::timestamptz then raise exception 'Invalid closure';end if;
 end loop;
 -- Prevent invalidating allocated resources. Hours/policy edits affect new bookings only.
 if (c->'rooms' is distinct from p_config->'rooms' or c->'counter'->'capacity' is distinct from p_config->'counter'->'capacity')
 and exists(select 1 from aburii.bookings b where aburii.active(b) and b.ends_at>clock_timestamp()) then raise exception 'Configuration has active reservations';end if;
 update aburii.settings set config=p_config,version=version+1 where id;
 insert into aburii.audit(actor,event,details) values(auth.uid(),'configuration_changed',jsonb_build_object('version',v+1));
 return jsonb_build_object('ok',true);
end $$;

create function public.aburii_rate_limit(p_key text,p_limit integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if length(p_key)<>64 or p_limit not between 1 and 500 then return false;end if;
 delete from aburii.rates where window_start<clock_timestamp()-interval '2 minutes';
 insert into aburii.rates(key,window_start,count) values(p_key,date_trunc('minute',clock_timestamp()),1)
 on conflict(key) do update set window_start=excluded.window_start,count=case when aburii.rates.window_start=excluded.window_start then aburii.rates.count+1 else 1 end returning count into n;
 return n<=p_limit;
end $$;

create function public.aburii_expire_holds() returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from aburii.settings where id for update;
 perform aburii.expire();
end $$;
create function public.aburii_claim_notifications() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Drop stale, unsent status updates instead of sending an obsolete confirmation.
 update aburii.outbox o set discarded_at=clock_timestamp(),last_error='Superseded status'
 where o.delivered_at is null and o.discarded_at is null and exists(
 select 1 from aburii.bookings b where b.id=o.booking_id and b.status<>o.event);
 with candidates as (select id from aburii.outbox where delivered_at is null and discarded_at is null and attempts<8 and available_at<=clock_timestamp() order by available_at for update skip locked limit 10),
 claimed as (update aburii.outbox o set attempts=attempts+1,available_at=clock_timestamp()+interval '5 minutes',lease=gen_random_uuid() from candidates c where o.id=c.id returning o.*)
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into result from claimed;
 return result;
end $$;
create function public.aburii_finish_notification(p_id uuid,p_lease uuid,p_success boolean,p_error text default null) returns void language sql security definer set search_path='' as $$
 update aburii.outbox set delivered_at=case when p_success then clock_timestamp() else null end,
 last_error=case when p_success then null else left(p_error,120) end,
 available_at=clock_timestamp()+make_interval(secs=>least(3600,(power(2,attempts)*30)::integer))
 where id=p_id and lease=p_lease and delivered_at is null;
$$;
-- Fail closed: internal functions cannot be invoked by browser or service clients.
revoke all on all functions in schema aburii from public,anon,authenticated,service_role;
revoke all on function public.aburii_availability(date,text,integer),public.aburii_book(jsonb),public.aburii_rate_limit(text,integer),public.aburii_expire_holds(),public.aburii_claim_notifications(),public.aburii_finish_notification(uuid,uuid,boolean,text),public.aburii_staff_data(),public.aburii_status(uuid,text,text),public.aburii_assign(uuid,text),public.aburii_configure(jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.aburii_availability(date,text,integer),public.aburii_book(jsonb),public.aburii_rate_limit(text,integer),public.aburii_expire_holds(),public.aburii_claim_notifications(),public.aburii_finish_notification(uuid,uuid,boolean,text) to service_role;
grant execute on function public.aburii_staff_data(),public.aburii_status(uuid,text,text),public.aburii_assign(uuid,text),public.aburii_configure(jsonb,integer) to authenticated;
commit;
