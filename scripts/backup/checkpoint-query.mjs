// The same read-only fingerprint query used in the verified actual-archive restore.
export function checkpointQuery(toc) {
 const quote=v=>'"'+v.replaceAll('"','""')+'"';
 const tables=[];
 for(const line of toc.split('\n').filter(l=>l.includes(' TABLE DATA '))) {
  const m=line.match(/^\d+; \d+ \d+ TABLE DATA ([a-z_][a-z0-9_]*) ([a-z_][a-z0-9_]*) /);
  if(!m) throw Error('Unrecognized archive table identifier.');
  tables.push({schema:m[1],table:m[2]});
 }
 const tableParts=tables.map(({schema,table})=>`'${schema}.${table}',(select jsonb_build_object('count',count(*),'digest',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,E'\\n' order by to_jsonb(r)::text collate "C"),''),'UTF8')),'hex')) from ${quote(schema)}.${quote(table)} r)`);
 const fingerprint=`select jsonb_build_object(
 'tables',jsonb_build_object(${tableParts.join(',')}),
 'database_owner',(select pg_get_userbyid(datdba) from pg_database where datname=current_database()),
 'runtime',jsonb_build_object('privileged_role',current_setting('supautils.privileged_role',true),'superuser',coalesce(nullif(current_setting('supautils.superuser',true),''),(select rolname from pg_roles where oid=10))),
 'event_triggers',(select jsonb_agg(jsonb_build_array(evtname,evtevent,evtenabled,pg_get_userbyid(evtowner),evtfoid::regprocedure::text,evttags) order by evtname) from pg_event_trigger),
 'extensions',(select jsonb_agg(jsonb_build_array(extname,extversion) order by extname) from pg_extension where extname<>'plpgsql'),
 'sequences',(select jsonb_agg(jsonb_build_array(schemaname,sequencename,start_value,min_value,max_value,increment_by,cycle,last_value) order by schemaname,sequencename) from pg_sequences where schemaname!~'^pg_'),
 'security',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,(select jsonb_agg(jsonb_build_array(r,has_schema_privilege(r,n.oid,'USAGE'),has_table_privilege(r,c.oid,'SELECT'),has_table_privilege(r,c.oid,'INSERT'),has_table_privilege(r,c.oid,'UPDATE'),has_table_privilege(r,c.oid,'DELETE')) order by r) from unnest(array['anon','authenticated','service_role']) r)) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname!~'^pg_' and n.nspname<>'information_schema'),
 'functions',(select jsonb_agg(jsonb_build_array(n.nspname,f.proname,pg_get_function_identity_arguments(f.oid),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig,md5(pg_get_functiondef(f.oid)),(select jsonb_agg(jsonb_build_array(r,has_function_privilege(r,f.oid,'EXECUTE')) order by r) from unnest(array['anon','authenticated','service_role']) r)) order by n.nspname,f.proname,pg_get_function_identity_arguments(f.oid)) from pg_proc f join pg_namespace n on n.oid=f.pronamespace where n.nspname!~'^pg_' and n.nspname<>'information_schema' and f.prokind in ('f','p') and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=f.oid and d.deptype='e')),
 'policies',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,pol.polname,pol.polcmd,pol.polpermissive,pg_get_expr(pol.polqual,pol.polrelid),pg_get_expr(pol.polwithcheck,pol.polrelid)) order by n.nspname,c.relname,pol.polname) from pg_policy pol join pg_class c on c.oid=pol.polrelid join pg_namespace n on n.oid=c.relnamespace),
 'constraints',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid)) order by n.nspname,c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname!~'^pg_' and n.nspname<>'information_schema'),
 'indexes',(select jsonb_agg(jsonb_build_array(schemaname,tablename,indexname,indexdef) order by schemaname,tablename,indexname) from pg_indexes where schemaname!~'^pg_' and schemaname<>'information_schema')
 ) as checkpoint;`;
 return {tables,fingerprint};
}
