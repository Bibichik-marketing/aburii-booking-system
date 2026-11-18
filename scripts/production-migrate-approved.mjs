// One-shot runner for the owner's explicit 2026-11-18 approval. No retry or rollback automation.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,lstatSync,openSync,closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {supabaseConfig,supabaseHeaders} from '../lib/supabase-config.mjs';
import {checkpointQuery} from './backup/checkpoint-query.mjs';
const project='oemwlqisfwrhfxsvuszi';
const root=resolve(import.meta.dirname,'..');
const backup=join(root,'.backups/production-2026-11-17T09-40-57-358Z');
const ledgerPath=join(root,'.backups/production-execution-'+project+'.json');
const migrations=[
 {file:'001_aburii.sql',sha256:'ec7584871659d2a4d8069d59a1fdda7030da87374117c1a80bbde036bace1702'},
 {file:'002_staff_workspace.sql',sha256:'d6334ca4862e876ddda1430601fa98b74c73e783ba83deed7a7c6221186ee01b'},
 {file:'003_operating_hours.sql',sha256:'9618f820855a94ad5d8709cce71582b15599db749e680fa750497697ff9e026f'},
];
const clean={PATH:process.env.PATH,HOME:process.env.HOME};
const hash=body=>createHash('sha256').update(body).digest('hex');
let stage='local guards',ledger;
const save=()=>writeFileSync(ledgerPath,JSON.stringify(ledger,null,2)+'\n',{mode:0o600});
function privateFile(path) {
 const f=lstatSync(path);
 if(!f.isFile()||f.isSymbolicLink()||f.uid!==process.getuid()||(f.mode&0o777)!==0o600) throw Error('Private file guard failed.');
}
function run(program,args,env=clean,input) {
 const r=spawnSync(program,args,{env,input,encoding:'utf8',maxBuffer:32*1024*1024});
 if(r.status!==0) {
  const sqlstate=(r.stderr||'').match(/ERROR:\s+([0-9A-Z]{5})/);
  throw Error(`${stage}: ${program} exit ${r.status}; SQLSTATE ${sqlstate?.[1]||'unavailable'}; STOPPED without retry. Raw diagnostics suppressed.`);
 }
 return (r.stdout||'').trim();
}
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function withoutNewObjects(snapshot) {
 const copy=structuredClone(snapshot);
 for(const field of ['sequences','security','policies','constraints','indexes']) if(copy[field]) copy[field]=copy[field].filter(row=>row[0]!=='aburii');
 if(copy.functions) copy.functions=copy.functions.filter(row=>row[0]!=='aburii'&&!(row[0]==='public'&&row[1].startsWith('aburii_')));
 return copy;
}
try {
 if(process.argv[2]!==`--execute-approved-${project}`) throw Error('Explicit approved-execution flag required.');
 for(const name of ['.env.production.local','.env.backup.local']) privateFile(join(root,name));
 const config=supabaseConfig({...process.env,NODE_ENV:'production'});
 if(config.url!==`https://${project}.supabase.co`||config.local) throw Error('API project pin mismatch.');
 const p=process.env;
 if(p.ABURII_BACKUP_PROJECT_REF!==project||p.ABURII_BACKUP_DB_HOST!=='aws-1-ap-southeast-1.pooler.supabase.com'||p.ABURII_BACKUP_DB_PORT!=='5432'||p.ABURII_BACKUP_DB_USER!==`postgres.${project}`||p.ABURII_BACKUP_DB_NAME!=='postgres'||!p.ABURII_BACKUP_DB_PASSWORD||!p.ABURII_BACKUP_SSL_ROOT_CERT) throw Error('Native database project/tenant pin mismatch.');
 privateFile(p.ABURII_BACKUP_SSL_ROOT_CERT);
 const manifest=JSON.parse(readFileSync(join(backup,'manifest.json'),'utf8'));
 const recovery=JSON.parse(readFileSync(join(backup,'docker-recovery-report.json'),'utf8'));
 for(const file of ['manifest.json','database.dump','roles-no-passwords.sql','docker-recovery-report.json','source-checkpoint-fingerprint.json']) privateFile(join(backup,file));
 if(manifest.project!==project||recovery.project!==project||!manifest.productionArchiveRestoreVerified||!manifest.localMigrationRehearsalPassed||!recovery.fullComparisonPassed||!recovery.localMigrationRehearsalPassed||!recovery.localPostMigrationVerificationPassed||!recovery.sourceUnchanged||recovery.differingFields.length||manifest.archiveSha256!==recovery.archiveSha256) throw Error('Verified backup/rehearsal evidence mismatch.');
 if(hash(readFileSync(join(backup,'database.dump')))!==manifest.archiveSha256||hash(readFileSync(join(backup,'roles-no-passwords.sql')))!==manifest.rolesSha256) throw Error('Verified backup checksum mismatch.');
 const plan=JSON.parse(readFileSync(join(root,'supabase/migration-plan.json'),'utf8'));
 if(plan.projectReference!==project||!equal(plan.migrations,migrations)) throw Error('Reviewed migration plan mismatch.');
 const bodies=new Map();
 let originalConfigure;
 for(const item of migrations) {
  const path=join(root,'supabase',item.file);
  if(lstatSync(path).isSymbolicLink()) throw Error('Migration file cannot be a symlink.');
  const body=readFileSync(path,'utf8');
  if(hash(body)!==item.sha256) throw Error('Approved migration checksum mismatch.');
  const chunks=body.split('$$');
  for(let i=1;i<chunks.length;i+=2) {
   const matches=[...chunks[i-1].matchAll(/create(?: or replace)? function\s+((?:public|aburii)\.[a-z_]+)\s*\(/gi)];
   if(matches.length) {
    const name=matches.at(-1)[1];
    bodies.set(name,hash(chunks[i]));
    if(item.file==='001_aburii.sql'&&name==='public.aburii_configure') originalConfigure=hash(chunks[i]);
   }
  }
 }
 if(!originalConfigure) throw Error('Original configuration validator missing.');
 bodies.set('aburii.configure_base',originalConfigure);
 if(bodies.size!==24) throw Error('Unexpected final reviewed function set.');
 for(const file of ['inspect_production.sql','verify_production.sql','verify_production_full.sql']) {
  const approved=run('git',['show',`eb778bc:supabase/${file}`]);
  if(readFileSync(join(root,'supabase',file),'utf8').trim()!==approved.trim()) throw Error('Prepared inspection/verification script changed.');
 }
 const guard=openSync(ledgerPath,'wx',0o600);closeSync(guard);
 ledger={project,status:'PREFLIGHT',startedAt:new Date().toISOString(),backupArchiveSha256:manifest.archiveSha256,migrations:migrations.map(item=>({...item,status:'NOT_STARTED'})),verifications:[],retryAllowed:false};save();
 console.log('PASS: exact API/database tenant pins, approved migration/verification files, backup hashes and real restore/rehearsal evidence.');
 const env={...clean,PGHOST:p.ABURII_BACKUP_DB_HOST,PGPORT:'5432',PGUSER:p.ABURII_BACKUP_DB_USER,PGDATABASE:'postgres',PGPASSWORD:p.ABURII_BACKUP_DB_PASSWORD,PGSSLMODE:'verify-full',PGSSLROOTCERT:p.ABURII_BACKUP_SSL_ROOT_CERT,PGPASSFILE:'/dev/null',PGSERVICEFILE:'/dev/null',PGCONNECT_TIMEOUT:'15'};
 const psqlArgs=['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'];
 const sql=text=>run('psql',psqlArgs,env,text);
 const read=text=>sql("begin read only;set local statement_timeout='30s';set local timezone='UTC';set local datestyle='ISO,YMD';set local search_path=pg_catalog;"+text+'rollback;');
 stage='Production API destination';
 const response=await fetch(config.url+'/rest/v1/',{method:'GET',headers:{...supabaseHeaders(config,'service'),Accept:'application/openapi+json'},redirect:'error',signal:AbortSignal.timeout(15000)});
 const api=await response.json();
 if(response.status!==200||Object.keys(api.paths||{}).some(path=>path.startsWith('/rpc/aburii_'))) throw Error('Unexpected Production API pre-migration state.');
 stage='Production catalog preflight';
 run('psql',[...psqlArgs,'-f',join(root,'supabase/inspect_production.sql')],env);
 const state=JSON.parse(read("select jsonb_build_object('current_user',current_user,'database',current_database(),'server_version',current_setting('server_version'),'read_only',current_setting('transaction_read_only'),'in_recovery',pg_is_in_recovery(),'auth_users',to_regclass('auth.users') is not null,'auth_uid',to_regprocedure('auth.uid()') is not null,'uuid',to_regprocedure('pg_catalog.gen_random_uuid()') is not null,'create_schema',has_database_privilege(current_user,current_database(),'CREATE'),'auth_references',has_table_privilege(current_user,'auth.users','REFERENCES'),'aburii_exists',to_regnamespace('aburii') is not null,'conflicts',(select count(*) from pg_proc q join pg_namespace n on n.oid=q.pronamespace where n.nspname='public' and left(q.proname,7)='aburii_'),'migration_history',to_regclass('supabase_migrations.schema_migrations') is not null);"));
 if(state.current_user!=='postgres'||state.database!=='postgres'||state.server_version!==manifest.source.server_version||state.read_only!=='on'||state.in_recovery||!state.auth_users||!state.auth_uid||!state.uuid||!state.create_schema||!state.auth_references||state.aburii_exists||state.conflicts!==0||state.migration_history) throw Error('Production state differs from the approved fresh-install prerequisites.');
 const toc=run('pg_restore',['--list',join(backup,'database.dump')]);
 const {tables,fingerprint}=checkpointQuery(toc);
 const expected=JSON.parse(readFileSync(join(backup,'source-checkpoint-fingerprint.json'),'utf8'));
 const before=JSON.parse(read(fingerprint));
 if(!equal(before,expected)) {
  ledger.preflightDifferingFields=Object.keys(expected).filter(k=>!equal(expected[k],before[k]));save();
  throw Error('Production no longer matches the verified backup checkpoint; no migration was executed.');
 }
 ledger.preflightPassed=true;ledger.status='EXECUTING';save();
 console.log(`PASS: current Production catalog and all ${tables.length} original table/catalog fingerprints match the verified checkpoint.`);
 for(const item of ledger.migrations) {
  stage=item.file;item.status='STARTED';item.startedAt=new Date().toISOString();save();
  run('psql',[...psqlArgs,'-c',"set statement_timeout='120s';set lock_timeout='5s';set idle_in_transaction_session_timeout='120s';",'-f',join(root,'supabase',item.file)],env);
  item.status='COMMITTED';item.committedAt=new Date().toISOString();save();
  const enabled=JSON.parse(read("select jsonb_build_object('counter',config->'counter'->'enabled','private',config->'private'->'enabled') from aburii.settings where id;"));
  if(enabled.counter!==false||enabled.private!==false) throw Error('Seating area enable flag unexpectedly changed.');
  console.log(`PASS: ${item.file} executed exactly once and committed; both seating areas disabled.`);
 }
 for(const file of ['verify_production.sql','verify_production_full.sql']) {
  stage=file;
  run('psql',[...psqlArgs,'-f',join(root,'supabase',file)],env);
  ledger.verifications.push({file,status:'PASS'});save();
  console.log(`PASS: ${file}`);
 }
 stage='existing Production data and object preservation';
 const after=JSON.parse(read(fingerprint));
 if(!equal(before,withoutNewObjects(after))) throw Error('Existing Production data/catalog preservation comparison failed.');
 ledger.existingProductionPreserved=true;
 stage='installed capacity and workflow bodies';
 const installed=JSON.parse(read("select jsonb_object_agg(n.nspname||'.'||q.proname,encode(sha256(convert_to(q.prosrc,'UTF8')),'hex')) from pg_proc q join pg_namespace n on n.oid=q.pronamespace where n.nspname='aburii' or (n.nspname='public' and left(q.proname,7)='aburii_');"));
 if(Object.keys(installed).length!==bodies.size||[...bodies].some(([name,digest])=>installed[name]!==digest)) throw Error('Installed function bodies differ from the exact reviewed capacity/workflow functions.');
 ledger.reviewedFunctionBodiesVerified=bodies.size;
 stage='final closed booking checks';
 const result=JSON.parse(read("select jsonb_build_object('publicBookingsEnabled',config->'publicBookingsEnabled','capacitiesConfirmed',config->'capacitiesConfirmed','policiesConfirmed',config->'policiesConfirmed','counterEnabled',config->'counter'->'enabled','privateEnabled',config->'private'->'enabled','counterCapacity',config->'counter'->'capacity','roomCount',jsonb_array_length(config->'rooms'),'arrivalInterval',config->'arrivalInterval','counterDuration',config->'counter'->'duration','privateDuration',config->'private'->'duration','officialHoursMatch',config->'operatingHours'=aburii.official_hours(),'bookings',(select count(*) from aburii.bookings),'staff',(select count(*) from aburii.staff),'queuedMessages',(select count(*) from aburii.outbox),'rlsTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='aburii' and c.relkind='r' and c.relrowsecurity)) from aburii.settings where id;"));
 for(const key of ['publicBookingsEnabled','capacitiesConfirmed','policiesConfirmed','counterEnabled','privateEnabled']) if(result[key]!==false) throw Error('Final launch/area flag is not false.');
 if(result.counterCapacity!==0||result.roomCount!==0||result.bookings!==0||result.staff!==0||result.queuedMessages!==0||result.rlsTables!==6||!result.officialHoursMatch) throw Error('Unexpected final fresh-install state.');
 const availability=JSON.parse(read("select jsonb_agg(jsonb_build_object('area',area,'monday',is_monday,'bookingOpen',v->'bookingOpen','slotCount',jsonb_array_length(v->'slots'),'closed',v->'closed')) from (select a.area,d.is_monday,public.aburii_availability(d.service_date,a.area,1) v from (values('counter'),('private')) a(area) cross join (select (clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date+1 AS service_date,false is_monday union all select date_trunc('week',clock_timestamp() at time zone 'Asia/Kuala_Lumpur')::date+7,true) d) x;"));
 if(availability.some(v=>v.bookingOpen!==false||v.slotCount!==0||v.monday&&v.closed!==true)) throw Error('Public availability gate verification failed.');
 ledger.result=result;ledger.availability=availability;ledger.status='PASS';ledger.completedAt=new Date().toISOString();save();
 console.log('PASS: all 40 original tables and pre-existing catalog/security objects preserved; 24 reviewed function bodies match exactly.');
 console.log(JSON.stringify({productionMigration:'PASS',project,committed:ledger.migrations.map(v=>v.file),verificationScripts:ledger.verifications,result,availability},null,2));
} catch(error) {
 if(ledger) {ledger.status='FAILED_STOPPED';ledger.failedStage=stage;ledger.failure=error instanceof Error?error.message:'Unexpected error; details suppressed.';ledger.stoppedAt=new Date().toISOString();try{save();}catch{}}
 console.error(error instanceof Error?error.message:'Unexpected error; credentials suppressed.');
 if(ledger) console.error(JSON.stringify({status:'FAILED_STOPPED',stage,migrations:ledger.migrations.map(({file,status})=>({file,status})),automaticRetry:false}));
 process.exitCode=1;
}
