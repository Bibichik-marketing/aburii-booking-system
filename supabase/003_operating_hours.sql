-- Official default hours, duration-aware arrivals and a fail-closed public launch gate.
-- No existing reservation, status, original interval, room allocation or audit row is changed.
begin;
create or replace function aburii.official_hours() returns jsonb language sql immutable set search_path='' as $$
 select '[{"day":0,"periods":[{"start":"12:00","end":"14:30"},{"start":"18:00","end":"22:30"}]},{"day":1,"periods":[]},{"day":2,"periods":[{"start":"18:00","end":"22:30"}]},{"day":3,"periods":[{"start":"18:00","end":"22:30"}]},{"day":4,"periods":[{"start":"18:00","end":"22:30"}]},{"day":5,"periods":[{"start":"18:00","end":"22:30"}]},{"day":6,"periods":[{"start":"12:00","end":"14:30"},{"start":"18:00","end":"22:30"}]}]'::jsonb;
$$;
-- Apply approved weekly defaults once. Preserve date-specific exceptions and all inventory.
do $$
begin
 perform 1 from aburii.settings where id for update;
 if not exists(select 1 from aburii.settings where config->>'hoursPolicyVersion'='aburii-official-v1') then
  update aburii.settings set version=version+1,config=config||jsonb_build_object(
   'operatingHours',aburii.official_hours(),'arrivalInterval',30,
   'publicBookingsEnabled',false,'capacitiesConfirmed',false,'policiesConfirmed',false,'hoursPolicyVersion','aburii-official-v1',
   'services',coalesce((select jsonb_agg(v) from jsonb_array_elements(config->'services') v where v ? 'date'),'[]'::jsonb)) where id;
  insert into aburii.audit(event,details) values('official_hours_initialized',jsonb_build_object('timezone','Asia/Kuala_Lumpur','publicBookingsEnabled',false));
 end if;
end $$;
create or replace function aburii.slots(c jsonb,d date,a text,g integer)
returns table(starts_at timestamptz,ends_at timestamptz) language sql volatile set search_path='' as $$
 with periods as (
 select (d::text||'T'||(p->>'start')||':00+08:00')::timestamptz opening,
 (d::text||'T'||(p->>'end')||':00+08:00')::timestamptz closing
 from jsonb_array_elements(c->'operatingHours') h cross join lateral jsonb_array_elements(h->'periods') p
 where (h->>'day')::integer=extract(dow from d)::integer and extract(dow from d)<>1
 ), specific as (
 select v from jsonb_array_elements(c->'services') v where v->>'area'=a and v->>'date'=d::text
 ), weekly as (
 select v from jsonb_array_elements(c->'services') v where v->>'area'=a and (v->>'day')::integer=extract(dow from d)::integer
 ), overrides as (
 select v from specific union all select v from weekly where not exists(select 1 from specific)
 ), explicit_times as (
 select (d::text||'T'||t||':00+08:00')::timestamptz s from overrides cross join lateral jsonb_array_elements_text(v->'times') t
 ), candidates as (
 select generate_series(opening,closing-make_interval(mins=>(c->a->>'duration')::integer),make_interval(mins=>(c->>'arrivalInterval')::integer)) s from periods where not exists(select 1 from overrides)
 union select s from explicit_times
 ), intervals as (
 select distinct s,s+make_interval(mins=>(c->a->>'duration')::integer) e from candidates
 )
 select s,e from intervals where
 coalesce((c->>'publicBookingsEnabled')::boolean,false) and coalesce((c->>'capacitiesConfirmed')::boolean,false) and coalesce((c->>'policiesConfirmed')::boolean,false)
 and (c->a->>'enabled')::boolean and extract(dow from d)<>1
 and g between (c->a->>'min')::integer and (c->a->>'max')::integer
 and exists(select 1 from periods where s>=opening and e<=closing)
 and s>=clock_timestamp()+make_interval(mins=>(c->>'noticeMinutes')::integer)
 and d<=(clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date+(c->>'advanceDays')::integer
 and not exists(select 1 from jsonb_array_elements(c->'closures') x where x->>'area' in (a,'all') and (x->>'start')::timestamptz<e and (x->>'end')::timestamptz>s);
$$;
create or replace function public.aburii_availability(p_date date,p_area text,p_guests integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;result jsonb;periods jsonb;open boolean;
begin
 if p_area not in ('counter','private') or p_guests not between 1 and 200 or p_date is null then raise exception 'Invalid request';end if;
 select config into c from aburii.settings where id;
 open=coalesce((c->>'publicBookingsEnabled')::boolean,false) and coalesce((c->>'capacitiesConfirmed')::boolean,false) and coalesce((c->>'policiesConfirmed')::boolean,false);
 select coalesce(h->'periods','[]'::jsonb) into periods from jsonb_array_elements(c->'operatingHours') h where (h->>'day')::integer=extract(dow from p_date)::integer;
 select coalesce(jsonb_agg(jsonb_build_object('start',s.starts_at,'end',s.ends_at) order by s.starts_at),'[]') into result from aburii.slots(c,p_date,p_area,p_guests) s where (aburii.capacity(c,p_area,s.starts_at,s.ends_at,p_guests)->>'available')::boolean;
 return jsonb_build_object('slots',result,'minimumSpend',c->p_area->'minimumSpend','holdMinutes',c->'holdMinutes','bookingOpen',open,'closed',extract(dow from p_date)=1 or coalesce(jsonb_array_length(periods),0)=0,'periods',coalesce(periods,'[]'::jsonb),'duration',c->p_area->'duration','arrivalInterval',c->'arrivalInterval','timezone','Asia/Kuala_Lumpur','operatingHours',c->'operatingHours');
end $$;
-- Retain the original lock, inventory validation, optimistic version and audit implementation.
do $$
begin
 if to_regprocedure('aburii.configure_base(jsonb,integer)') is null then
  alter function public.aburii_configure(jsonb,integer) set schema aburii;
  alter function aburii.aburii_configure(jsonb,integer) rename to configure_base;
 end if;
end $$;
create or replace function public.aburii_configure(p_config jsonb,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare h jsonb;p jsonb;
begin
 if aburii.role()<>'admin' then raise exception 'Administrator required' using errcode='42501';end if;
 if p_config is null or jsonb_path_exists(p_config,'$.** ? (@ == null)') or not(p_config ?& array['arrivalInterval','publicBookingsEnabled','capacitiesConfirmed','policiesConfirmed','operatingHours'])
 or (p_config->>'arrivalInterval')::integer not between 5 and 120
 or jsonb_typeof(p_config->'publicBookingsEnabled')<>'boolean' or jsonb_typeof(p_config->'capacitiesConfirmed')<>'boolean' or jsonb_typeof(p_config->'policiesConfirmed')<>'boolean'
 or jsonb_typeof(p_config->'operatingHours')<>'array' or jsonb_array_length(p_config->'operatingHours')<>7
 then raise exception 'Invalid operating hours';end if;
 if (select count(distinct day->>'day') from jsonb_array_elements(p_config->'operatingHours') day)<>7 then raise exception 'Invalid operating hours';end if;
 for h in select value from jsonb_array_elements(p_config->'operatingHours') loop
  if not(h ?& array['day','periods']) or (h->>'day')::integer not between 0 and 6 or jsonb_typeof(h->'periods')<>'array' or jsonb_array_length(h->'periods')>4
   or ((h->>'day')::integer=1 and jsonb_array_length(h->'periods')<>0) then raise exception 'Monday is closed';end if;
  for p in select value from jsonb_array_elements(h->'periods') loop
   if not(p ?& array['start','end']) or (p->>'start')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (p->>'end')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or (p->>'end')<=(p->>'start') then raise exception 'Invalid operating hours';end if;
  end loop;
 end loop;
 if (p_config->>'publicBookingsEnabled')::boolean and (
 not (p_config->>'capacitiesConfirmed')::boolean or not(p_config->>'policiesConfirmed')::boolean
 or not ((p_config->'counter'->>'enabled')::boolean or (p_config->'private'->>'enabled')::boolean)
 or ((p_config->'counter'->>'enabled')::boolean and (p_config->'counter'->>'capacity')::integer<=0)
 or ((p_config->'private'->>'enabled')::boolean and not exists(select 1 from jsonb_array_elements(p_config->'rooms') r where (r->>'enabled')::boolean))
 ) then raise exception 'Confirm capacity and policies before enabling bookings';end if;
 return aburii.configure_base(p_config||jsonb_build_object('hoursPolicyVersion','aburii-official-v1'),p_version);
end $$;
revoke all on function aburii.official_hours(),aburii.configure_base(jsonb,integer),aburii.slots(jsonb,date,text,integer) from public,anon,authenticated,service_role;
revoke all on function public.aburii_configure(jsonb,integer),public.aburii_availability(date,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.aburii_configure(jsonb,integer) to authenticated;
grant execute on function public.aburii_availability(date,text,integer) to service_role;
commit;
