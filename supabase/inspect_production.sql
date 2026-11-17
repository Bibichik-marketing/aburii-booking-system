-- READ-ONLY PRE-MIGRATION INSPECTION. Target must first be verified in the dashboard:
-- oemwlqisfwrhfxsvuszi (SQL current_database() does NOT prove a Supabase project ref).
-- No user rows, emails, credentials, JWTs, settings values or secrets are selected.
begin read only;
set local statement_timeout='15s';
set local lock_timeout='3s';
select current_database() database_name,current_user inspection_role,
 current_setting('server_version') server_version,
 current_setting('transaction_read_only') read_only,
 to_regclass('auth.users') is not null auth_users_exists,
 to_regprocedure('auth.uid()') is not null auth_uid_exists,
 to_regprocedure('pg_catalog.gen_random_uuid()') is not null uuid_generator_exists,
 to_regnamespace('aburii') is not null aburii_schema_already_exists,
 to_regclass('supabase_migrations.schema_migrations') is not null migration_history_exists;
select rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls
from pg_roles where rolname in (current_user,'anon','authenticated','service_role') order by rolname;
select n.nspname schema_name,c.relname relation_name,c.relkind,c.relrowsecurity rls_enabled,
 pg_get_userbyid(c.relowner) owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('r','p','v','m','f') and n.nspname !~ '^pg_'
 and n.nspname not in ('information_schema','auth','storage','realtime','extensions','vault','graphql','graphql_public','supabase_functions','supabase_migrations','_realtime','_analytics')
order by n.nspname,c.relname;
select n.nspname schema_name,p.proname function_name,pg_get_function_identity_arguments(p.oid) arguments,
 p.prosecdef security_definer,p.proconfig function_settings
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='aburii' or (n.nspname='public' and left(p.proname,7)='aburii_')
order by n.nspname,p.proname;
select evtname,evtevent,evtenabled,evtfoid::regprocedure handler
from pg_event_trigger order by evtname;
select pg_get_userbyid(d.defaclrole) owner,coalesce(n.nspname,'ALL_SCHEMAS') schema_name,d.defaclobjtype object_type,d.defaclacl grants
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname in ('public','aburii') or d.defaclnamespace=0;
-- Catalog-only authorization checks; these do not query staff/customer records.
select n.nspname schema_name,c.relname relation_name,r.rolname,
 has_schema_privilege(r.oid,n.oid,'USAGE') schema_usage,
 has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE') any_table_access
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join pg_roles r where n.nspname='aburii' and c.relkind in ('r','p')
 and r.rolname in ('anon','authenticated','service_role');
select n.nspname schema_name,c.relname relation_name,p.polname policy_name,p.polcmd operation,p.polpermissive permissive
from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('aburii','public') order by n.nspname,c.relname,p.polname;
rollback;
