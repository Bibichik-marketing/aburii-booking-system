-- READ ONLY. Run after approved migration of a verified fresh Aburii project, before provisioning.
-- Existing verify_production.sql must also pass. This checks every Aburii RPC, not only samples.
begin read only;
set local statement_timeout='15s';
do $$
declare f record;r text;allowed text;s jsonb;table_name text;actual_count bigint;
begin
 if (select count(*) from aburii.settings)<>1 then raise exception 'STOP: expected one settings row';end if;
 select config into strict s from aburii.settings where id;
 if (s->>'publicBookingsEnabled')::boolean is distinct from false
 or (s->>'capacitiesConfirmed')::boolean is distinct from false
 or (s->>'policiesConfirmed')::boolean is distinct from false
 or (s->'counter'->>'enabled')::boolean is distinct from false
 or (s->'private'->>'enabled')::boolean is distinct from false
 or (s->'counter'->>'capacity')::integer is distinct from 0
 or jsonb_array_length(s->'rooms')<>0
 or s->'operatingHours' is distinct from aburii.official_hours() then
  raise exception 'STOP: fresh-install hours/capacity/launch defaults do not match';
 end if;
 foreach table_name in array array['staff','bookings','outbox','rates'] loop
  execute format('select count(*) from aburii.%I',table_name) into actual_count;
  if actual_count<>0 then raise exception 'STOP: fresh installation unexpectedly contains data in %',table_name;end if;
 end loop;
 for f in select * from (values
  ('public.aburii_availability(date,text,integer)','service_role'),
  ('public.aburii_book(jsonb)','service_role'),
  ('public.aburii_rate_limit(text,integer)','service_role'),
  ('public.aburii_expire_holds()','service_role'),
  ('public.aburii_claim_notifications()','service_role'),
  ('public.aburii_finish_notification(uuid,uuid,boolean,text)','service_role'),
  ('public.aburii_staff_data()','authenticated'),
  ('public.aburii_status(uuid,text,text)','authenticated'),
  ('public.aburii_assign(uuid,text)','authenticated'),
  ('public.aburii_configure(jsonb,integer)','authenticated'),
  ('public.aburii_staff_context()','authenticated'),
  ('public.aburii_staff_list(text,date,date,text,text,text,text,integer,integer,text)','authenticated'),
  ('public.aburii_staff_detail(uuid)','authenticated'),
  ('public.aburii_staff_today()','authenticated'),
  ('public.aburii_staff_archive(uuid,boolean)','authenticated')
 ) as expected(signature,allowed_role) loop
  if to_regprocedure(f.signature) is null then raise exception 'STOP: missing RPC %',f.signature;end if;
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(r,f.signature,'EXECUTE') is distinct from (r=f.allowed_role) then
    raise exception 'STOP: incorrect RPC grant % / %',f.signature,r;
   end if;
  end loop;
 end loop;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and left(p.proname,7)='aburii_')<>15 then
  raise exception 'STOP: unexpected extra or missing Aburii public RPCs';
 end if;
 for f in select p.oid,p.prosecdef,p.proconfig,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='aburii' or (n.nspname='public' and left(p.proname,7)='aburii_') loop
  if not coalesce(f.proconfig @> array['search_path=""'],false) then raise exception 'STOP: unpinned function search path';end if;
  if f.nspname='public' and not f.prosecdef then raise exception 'STOP: public RPC must enforce its definer boundary';end if;
  if f.nspname='aburii' then
   foreach r in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(r,f.oid,'EXECUTE') then raise exception 'STOP: internal function exposed';end if;
   end loop;
  end if;
 end loop;
end $$;
select 'PASS: fresh defaults, no seeded application data, complete RPC grant matrix and pinned function paths' as verification;
rollback;
