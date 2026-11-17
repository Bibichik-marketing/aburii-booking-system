-- Read-only verification. Run ONLY after verifying Aburii project identity and applying 001–003.
-- Deliberately returns no credentials, customer details, staff emails or reservations.
begin read only;
do $$
declare s jsonb;r text;t text;
begin
 select config into strict s from aburii.settings where id;
 if (s->>'publicBookingsEnabled')::boolean is distinct from false
 or (s->>'capacitiesConfirmed')::boolean is distinct from false
 or (s->>'policiesConfirmed')::boolean is distinct from false then
  raise exception 'STOP: public launch flags must all remain false during preparation';
 end if;
 if s->'operatingHours' is distinct from aburii.official_hours()
 or s->>'hoursPolicyVersion' is distinct from 'aburii-official-v1' then
  raise exception 'STOP: official operating hours are not initialized';
 end if;
 for t in select unnest(array['settings','staff','bookings','audit','outbox','rates']) loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='aburii' and c.relname=t and c.relrowsecurity) then
   raise exception 'STOP: missing RLS';
  end if;
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_schema_privilege(r,'aburii','usage') or has_table_privilege(r,'aburii.'||t,'select,insert,update,delete') then
    raise exception 'STOP: private schema is exposed';
   end if;
  end loop;
 end loop;
 if has_function_privilege('anon','public.aburii_book(jsonb)','execute')
 or has_function_privilege('service_role','public.aburii_configure(jsonb,integer)','execute')
 or has_function_privilege('authenticated','aburii.configure_base(jsonb,integer)','execute') then
  raise exception 'STOP: unexpected privileged RPC access';
 end if;
 if not has_function_privilege('service_role','public.aburii_book(jsonb)','execute')
 or not has_function_privilege('authenticated','public.aburii_configure(jsonb,integer)','execute') then
  raise exception 'STOP: missing intended RPC grants';
 end if;
end $$;
select 'Aburii hours, launch gate, RLS and representative RPC grants verified; no data modified' as result;
rollback;
