-- Corrected supplementary check only. No migration, configuration or user writes.
begin read only;
set local statement_timeout='30s';
set local timezone='UTC';
set local search_path=pg_catalog;
with service_dates as (
 select (clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date + 1 as service_date,
        false as is_monday
 union all
 select date_trunc('week',clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date + 7 as service_date,
        true as is_monday
), area_checks as (
 select a.area,d.service_date,d.is_monday,
        public.aburii_availability(d.service_date,a.area,1) as availability
 from (values ('counter'),('private')) as a(area)
 cross join service_dates as d
)
select jsonb_build_object(
 'readOnly',current_setting('transaction_read_only')='on',
 'databaseIsPostgres',current_database()='postgres',
 'roleIsPostgres',current_user='postgres',
 'settings',(select jsonb_build_object(
   'publicBookingsEnabled',config->'publicBookingsEnabled',
   'capacitiesConfirmed',config->'capacitiesConfirmed',
   'policiesConfirmed',config->'policiesConfirmed',
   'counterEnabled',config->'counter'->'enabled',
   'privateEnabled',config->'private'->'enabled',
   'officialHoursMatch',config->'operatingHours'=aburii.official_hours(),
   'version',version,
   'counterCapacity',config->'counter'->'capacity',
   'roomCount',jsonb_array_length(config->'rooms')
 ) from aburii.settings where id),
 'availability',(select jsonb_agg(jsonb_build_object(
   'area',area,'serviceDate',service_date,'monday',is_monday,
   'bookingOpen',availability->'bookingOpen',
   'slotCount',jsonb_array_length(availability->'slots'),
   'closed',availability->'closed'
 ) order by service_date,area) from area_checks),
 'installation',jsonb_build_object(
   'tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='aburii' and c.relkind='r'),
   'rlsTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='aburii' and c.relkind='r' and c.relrowsecurity),
   'functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aburii' or (n.nspname='public' and left(p.proname,7)='aburii_')),
   'publicRPCs',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and left(p.proname,7)='aburii_'),
   'hoursInitializationEvents',(select count(*) from aburii.audit where event='official_hours_initialized'),
   'bookings',(select count(*) from aburii.bookings),
   'staff',(select count(*) from aburii.staff),
   'outbox',(select count(*) from aburii.outbox)
 ),
 'functionBodies',(select jsonb_object_agg(n.nspname||'.'||p.proname,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aburii' or (n.nspname='public' and left(p.proname,7)='aburii_'))
) as closed_booking_verification;
rollback;
