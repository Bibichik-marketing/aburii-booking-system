// Restore the actual Production archive into a disposable, network-disabled local container.
// Production access is limited to read-only fingerprints. No remote restore/migration code exists.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,readdirSync,chmodSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ABURII_PROJECT_REF} from '../../lib/supabase-config.mjs';
const root=resolve(import.meta.dirname,'../..'),base=join(root,'.backups');
const folder=readdirSync(base).filter(n=>n.startsWith('production-')).sort().at(-1);
if(!folder) throw Error('No Production archive found.');
const out=join(base,folder),archive=join(out,'database.dump'),roles=join(out,'roles-no-passwords.sql');
const manifest=JSON.parse(readFileSync(join(out,'manifest.json'),'utf8'));
const socket='unix:///Users/josephine/.colima/aburii-recovery/docker.sock';
const image='supabase/postgres@sha256:6c056e9a0f81d423c1a81fdf4e6587c16efd3f63960897371dab8ae2694a4714';
const name='aburii-production-recovery-'+Date.now(),bootstrap='supabase_admin';
const cleanEnv={PATH:process.env.PATH,HOME:process.env.HOME};
let created=false,stage='guard';
const quote=v=>'"'+v.replaceAll('"','""')+'"';
function run(program,args,env=cleanEnv,input) {
 const r=spawnSync(program,args,{env,input,encoding:'utf8',maxBuffer:32*1024*1024});
 if(r.status!==0) {
  const raw=r.stderr||'';
  let summary=(raw.split('\n').find(line=>line.includes('ERROR:'))||'').replace(/"[^"]*"/g,'[identifier]').replace(/'[^']*'/g,'[value]').replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+/g,'[REDACTED]');
  if(process.env.ABURII_BACKUP_DB_PASSWORD) summary=summary.replaceAll(process.env.ABURII_BACKUP_DB_PASSWORD,'[REDACTED]');
  summary=summary.slice(0,180);
  const patterns=[['missing_extension',/extension "([a-z_]+)" is not available/],['missing_role',/role "([a-z_]+)" does not exist/],['existing_role',/role "([a-z_]+)" already exists/],['existing_schema',/schema "([a-z_]+)" already exists/],['missing_library',/could not access file "([^"\n]+)"/],['unsupported_parameter',/unrecognized configuration parameter "([a-z_]+)"/]];
  const diagnostic=patterns.map(([key,re])=>{const m=raw.match(re);return m?`${key}:${m[1]}`:null;}).filter(Boolean).join(',');
  throw Error(`${stage}: ${program} failed (exit ${r.status}); ${diagnostic||summary||'private diagnostics suppressed'}`);
 }
 return (r.stdout||'').trim();
}
const docker=(args,input)=>run('docker',['--host',socket,...args],cleanEnv,input);
const targetSql=(sql,user=bootstrap)=>docker(['exec','-i',name,'psql','-h','/tmp','-X','-qAt','-v','ON_ERROR_STOP=1','-U',user,'-d','postgres'],sql);
try {
 if(manifest.project!==ABURII_PROJECT_REF||createHash('sha256').update(readFileSync(archive)).digest('hex')!==manifest.archiveSha256||createHash('sha256').update(readFileSync(roles)).digest('hex')!==manifest.rolesSha256) throw Error('Archive identity/checksum mismatch.');
 const privateEnv=lstatSync(join(root,'.env.backup.local'));
 if(privateEnv.isSymbolicLink()||(privateEnv.mode&0o777)!==0o600) throw Error('Unsafe private environment.');
 const p=process.env;
 const validHost=p.ABURII_BACKUP_DB_HOST==='db.'+ABURII_PROJECT_REF+'.supabase.co'&&p.ABURII_BACKUP_DB_USER==='postgres'||/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(p.ABURII_BACKUP_DB_HOST||'')&&p.ABURII_BACKUP_DB_USER==='postgres.'+ABURII_PROJECT_REF;
 if(!validHost||p.ABURII_BACKUP_PROJECT_REF!==ABURII_PROJECT_REF||p.ABURII_BACKUP_DB_PORT!=='5432'||p.ABURII_BACKUP_DB_NAME!=='postgres'||!p.ABURII_BACKUP_DB_PASSWORD||!p.ABURII_BACKUP_SSL_ROOT_CERT) throw Error('Invalid pinned read-only source.');
 const sourceEnv={...cleanEnv,PGHOST:p.ABURII_BACKUP_DB_HOST,PGPORT:'5432',PGUSER:p.ABURII_BACKUP_DB_USER,PGDATABASE:'postgres',PGPASSWORD:p.ABURII_BACKUP_DB_PASSWORD,PGSSLMODE:'verify-full',PGSSLROOTCERT:p.ABURII_BACKUP_SSL_ROOT_CERT,PGPASSFILE:'/dev/null',PGSERVICEFILE:'/dev/null',PGCONNECT_TIMEOUT:'15'};
 const sourceSql=sql=>run('psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],sourceEnv,'begin read only; set local timezone=\'UTC\'; set local datestyle=\'ISO,YMD\'; set local search_path=pg_catalog; '+sql+' rollback;');
 const toc=run('pg_restore',['--list',archive]);
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
 stage='source fingerprint';
 const before=JSON.parse(sourceSql(fingerprint));
 writeFileSync(join(out,'source-checkpoint-fingerprint.json'),JSON.stringify(before,null,2)+'\n',{mode:0o600});
 if(!/^[a-z_][a-z0-9_]*$/.test(before.runtime.privileged_role||'')||!/^[a-z_][a-z0-9_]*$/.test(before.runtime.superuser||'')) throw Error('Unexpected source privilege configuration.');
 stage='container initialization';
 docker(['run','--detach','--network','none','--user','postgres','--label','aburii.purpose=production-recovery','--name',name,'--entrypoint','/bin/sh',image,'-c',`umask 077; mkdir /tmp/aburii-restore; initdb -D /tmp/aburii-data --username=${bootstrap} --auth-local=trust --auth-host=reject --no-locale -E UTF8 >/dev/null; exec postgres -D /tmp/aburii-data -k /tmp -c listen_addresses='' -c shared_preload_libraries=pg_stat_statements,supautils -c supautils.privileged_role=${before.runtime.privileged_role} -c supautils.superuser=${before.runtime.superuser} -c log_min_messages=panic -c log_min_error_statement=panic -c log_statement=none`]);
 created=true;
 const isolation=JSON.parse(docker(['inspect',name]))[0];
 if(isolation.HostConfig.NetworkMode!=='none'||Object.keys(isolation.HostConfig.PortBindings||{}).length||isolation.Mounts.some(m=>m.Type==='bind')||isolation.Config.Labels['aburii.purpose']!=='production-recovery') throw Error('Container isolation guard failed.');
 for(let n=0;n<40;n++) { const r=spawnSync('docker',['--host',socket,'exec',name,'pg_isready','-h','/tmp','-U',bootstrap],{env:cleanEnv,stdio:'ignore'}); if(r.status===0) break; if(n===39) throw Error('Local database did not become ready.'); await new Promise(r=>setTimeout(r,500)); }
 stage='restore roles';
 const originalRoles=readFileSync(roles,'utf8');
 const bootstrapCreate=/^CREATE ROLE (?:supabase_admin|"supabase_admin");\r?\n/gm;
 if((originalRoles.match(bootstrapCreate)||[]).length!==1) throw Error('Expected source bootstrap role definition is missing.');
 // initdb already created this exact role; retain its ALTER ROLE and every membership grant.
 targetSql(originalRoles.replace(bootstrapCreate,'-- source bootstrap role already provisioned by initdb\n'));
 targetSql(`alter database postgres owner to ${quote(before.database_owner)};`);
 stage='copy private archive';
 docker(['exec','-i',name,'/bin/sh','-c','umask 077; cat > /tmp/aburii-restore/checkpoint.dump'],readFileSync(archive));
 stage='restore actual Production archive';
 // Event triggers must be created in their original owner's session context.
 // Partition the TOC; every entry is replayed, with no omission or data filtering.
 const entries=toc.split('\n').filter(line=>/^\d+;/.test(line));
 const events=entries.filter(line=>line.includes(' EVENT TRIGGER '));
 const main=entries.filter(line=>!line.includes(' EVENT TRIGGER '));
 if(events.length+main.length!==entries.length||!events.length) throw Error('Invalid complete archive partition.');
 for(const [file,lines] of [['main.list',main],['events.list',events]]) docker(['exec','-i',name,'/bin/sh','-c','umask 077; cat > /tmp/aburii-restore/'+file],lines.join('\n')+'\n');
 docker(['exec',name,'pg_restore','--exit-on-error','--single-transaction','--clean','--if-exists','--use-list=/tmp/aburii-restore/main.list','--role=supabase_admin','-h','/tmp','-U',bootstrap,'-d','postgres','/tmp/aburii-restore/checkpoint.dump']);
 stage='restore original-owner event triggers';
 docker(['exec',name,'pg_restore','--exit-on-error','--single-transaction','--use-set-session-authorization','--use-list=/tmp/aburii-restore/events.list','-h','/tmp','-U',bootstrap,'-d','postgres','/tmp/aburii-restore/checkpoint.dump']);
 stage='restore comparison';
 const restored=JSON.parse(targetSql("begin read only;set local timezone='UTC';set local datestyle='ISO,YMD';set local search_path=pg_catalog;"+fingerprint+'rollback;','postgres'));
 const after=JSON.parse(sourceSql(fingerprint));
 const differingFields=Object.keys(before).filter(k=>JSON.stringify(before[k])!==JSON.stringify(restored[k]));
 const sourceUnchanged=JSON.stringify(before)===JSON.stringify(after);
 const report={project:ABURII_PROJECT_REF,archiveSha256:manifest.archiveSha256,checkedAt:new Date().toISOString(),image,destination:'local Docker container; no network, published ports, host mounts or external workers',tableCount:tables.length,differingFields,sourceUnchanged,fullArchiveRestoreSucceeded:true,fullComparisonPassed:!differingFields.length&&sourceUnchanged,productionMutations:false};
 writeFileSync(join(out,'docker-recovery-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 writeFileSync(join(out,'restored-checkpoint-fingerprint.json'),JSON.stringify(restored,null,2)+'\n',{mode:0o600});
 if(differingFields.length||!sourceUnchanged) throw Error('Comparison failed; field labels: '+differingFields.join(',')+'; source unchanged: '+sourceUnchanged);
 stage='local migration rehearsal';
 const approved=JSON.parse(readFileSync(join(root,'supabase/migration-plan.json'),'utf8'));
 if(approved.projectReference!==ABURII_PROJECT_REF) throw Error('Migration plan target mismatch.');
 for(const migration of approved.migrations) {
  const body=readFileSync(join(root,'supabase',migration.file));
  if(createHash('sha256').update(body).digest('hex')!==migration.sha256) throw Error('Migration checksum mismatch.');
  targetSql(body,'postgres');
 }
 for(const verification of ['verify_production.sql','verify_production_full.sql']) targetSql(readFileSync(join(root,'supabase',verification),'utf8'),'postgres');
 const gates=JSON.parse(targetSql("begin read only;select json_build_object('publicBookingsEnabled',config->'publicBookingsEnabled','capacitiesConfirmed',config->'capacitiesConfirmed','policiesConfirmed',config->'policiesConfirmed','counterEnabled',config->'counter'->'enabled','privateEnabled',config->'private'->'enabled') from aburii.settings where id;rollback;",'postgres'));
 if(Object.values(gates).some(value=>value!==false)) throw Error('Local rehearsal launch gate changed.');
 if(JSON.stringify(before)!==JSON.stringify(JSON.parse(sourceSql(fingerprint)))) throw Error('Production fingerprint changed during local rehearsal.');
 report.localMigrationRehearsalPassed=true;
 report.localPostMigrationVerificationPassed=true;
 report.publicBookingGates=gates;
 writeFileSync(join(out,'docker-recovery-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 manifest.productionArchiveRestoreVerified=true;
 manifest.localMigrationRehearsalPassed=true;
 manifest.recoveryReport='docker-recovery-report.json';
 delete manifest.restoreBlocker;
 writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 chmodSync(join(out,'manifest.json'),0o600);
 console.log('PASS: actual Production archive restored completely in isolated Supabase PostgreSQL 17.12. All archived table data, sequences, constraints, indexes, non-extension functions, RLS/policies and effective API-role permissions match.');
 console.log('PASS: 001→002→003 rehearsed only on the local clone; both post-migration checks pass and all launch/area flags remain false.');
 console.log('PASS: Production fingerprint unchanged. No Production migration, invitation, Auth setting or remote restore was executed.');
} catch(error) { console.error(error instanceof Error?error.message:'Recovery failed; private diagnostics suppressed.');process.exitCode=1; }
finally { if(created) spawnSync('docker',['--host',socket,'rm','--force',name],{env:cleanEnv,stdio:'ignore'}); }
