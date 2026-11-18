// Only the user-approved corrected supplementary read-only check; never invokes migrations.
import {readFileSync,writeFileSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),project='oemwlqisfwrhfxsvuszi';
const digest=s=>createHash('sha256').update(s).digest('hex');
try {
 const file=lstatSync(join(root,'.env.backup.local'));
 if(!file.isFile()||file.isSymbolicLink()||file.uid!==process.getuid()||(file.mode&0o777)!==0o600) throw Error('Private environment guard failed.');
 const p=process.env;
 if(p.ABURII_BACKUP_PROJECT_REF!==project||p.ABURII_BACKUP_DB_HOST!=='aws-1-ap-southeast-1.pooler.supabase.com'||p.ABURII_BACKUP_DB_PORT!=='5432'||p.ABURII_BACKUP_DB_USER!==`postgres.${project}`||p.ABURII_BACKUP_DB_NAME!=='postgres'||!p.ABURII_BACKUP_DB_PASSWORD||!p.ABURII_BACKUP_SSL_ROOT_CERT) throw Error('Pinned Production destination guard failed.');
 const record=JSON.parse(readFileSync(join(root,'.backups/production-execution-'+project+'.json'),'utf8'));
 const plan=JSON.parse(readFileSync(join(root,'supabase/migration-plan.json'),'utf8'));
 if(record.project!==project||record.migrations.length!==3||new Set(record.migrations.map(m=>m.file)).size!==3||record.migrations.some((m,i)=>m.status!=='COMMITTED'||m.file!==plan.migrations[i].file||m.sha256!==plan.migrations[i].sha256)||!record.existingProductionPreserved||record.reviewedFunctionBodiesVerified!==24) throw Error('Original execution evidence mismatch.');
 if(record.verifications.length!==2||!['verify_production.sql','verify_production_full.sql'].every(file=>record.verifications.some(v=>v.file===file&&v.status==='PASS'))) throw Error('Required verification PASS evidence missing.');
 const bodies=new Map();let base;
 for(const m of plan.migrations) {
  const body=readFileSync(join(root,'supabase',m.file),'utf8');
  if(digest(body)!==m.sha256) throw Error('Reviewed SQL checksum changed.');
  const chunks=body.split('$$');
  for(let i=1;i<chunks.length;i+=2){const names=[...chunks[i-1].matchAll(/create(?: or replace)? function\s+((?:public|aburii)\.[a-z_]+)\s*\(/gi)];if(names.length){const name=names.at(-1)[1];bodies.set(name,digest(chunks[i]));if(m.file==='001_aburii.sql'&&name==='public.aburii_configure')base=digest(chunks[i]);}}
 }
 if(!base) throw Error('Original validator body missing.');
 bodies.set('aburii.configure_base',base);
 const query=readFileSync(join(root,'supabase/verify_booking_closed.sql'),'utf8');
 if(!query.includes('begin read only;')||!query.trim().endsWith('rollback;')) throw Error('Read-only query guard failed.');
 const env={PATH:p.PATH,HOME:p.HOME,PGHOST:p.ABURII_BACKUP_DB_HOST,PGPORT:'5432',PGUSER:p.ABURII_BACKUP_DB_USER,PGDATABASE:'postgres',PGPASSWORD:p.ABURII_BACKUP_DB_PASSWORD,PGSSLMODE:'verify-full',PGSSLROOTCERT:p.ABURII_BACKUP_SSL_ROOT_CERT,PGPASSFILE:'/dev/null',PGSERVICEFILE:'/dev/null',PGCONNECT_TIMEOUT:'15'};
 const r=spawnSync('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],{env,input:query,encoding:'utf8',maxBuffer:4*1024*1024});
 if(r.status!==0) {const state=(r.stderr||'').match(/ERROR:\s+([A-Z0-9]{5})/);throw Error(`Read-only follow-up failed; SQLSTATE ${state?.[1]||'unavailable'}; stopped without retry. Raw diagnostics suppressed.`);}
 const data=JSON.parse(r.stdout.trim());
 if(!data.readOnly||!data.databaseIsPostgres||!data.roleIsPostgres) throw Error('Unexpected read-only/session state.');
 for(const key of ['publicBookingsEnabled','capacitiesConfirmed','policiesConfirmed','counterEnabled','privateEnabled']) if(data.settings[key]!==false) throw Error('Public/area booking gate is not false.');
 if(!data.settings.officialHoursMatch||data.settings.version!==2||data.settings.counterCapacity!==0||data.settings.roomCount!==0) throw Error('Unexpected settings initialization state.');
 if(data.availability.length!==4||data.availability.some(v=>v.bookingOpen!==false||v.slotCount!==0||v.monday&&v.closed!==true)) throw Error('Read-only availability check failed.');
 const i=data.installation;
 if(i.tables!==6||i.rlsTables!==6||i.functions!==24||i.publicRPCs!==15||i.hoursInitializationEvents!==1||i.bookings!==0||i.staff!==0||i.outbox!==0) throw Error('Unexpected migration installation or application data state.');
 if(bodies.size!==24||Object.keys(data.functionBodies).length!==24||[...bodies].some(([name,hash])=>data.functionBodies[name]!==hash)) throw Error('Installed functions differ from the reviewed SQL.');
 const result={project,status:'PASS',databaseMigrationStage:'COMPLETE',checkedAt:new Date().toISOString(),sqlSha256:digest(query),originalExecutionRecordPreserved:true,migrations:record.migrations.map(({file,status,committedAt})=>({file,status,committedAt})),previousRequiredVerifications:record.verifications,settings:data.settings,availability:data.availability,installation:data.installation,reviewedFunctionBodiesVerified:24,productionWrites:false,authChanges:false};
 writeFileSync(join(root,'.backups/production-readonly-followup-'+project+'.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(result,null,2));
} catch(error) {console.error(error instanceof Error?error.message:'Read-only follow-up failed; credentials suppressed.');process.exitCode=1;}
