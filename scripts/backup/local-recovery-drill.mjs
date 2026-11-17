// A new recovery drill, not a migration-suite rerun. Source: existing synthetic local database only.
// Never imports Production environment files; never creates a new reservation request.
import { spawnSync } from 'node:child_process';
import { mkdtempSync,mkdirSync,lstatSync,chmodSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { config,databaseEnvironment,root } from '../local/core.mjs';
const c=config(),source={...databaseEnvironment(c),PGTZ:'UTC'};
const temp=mkdtempSync(join(tmpdir(),'aburii-recovery-drill-'));
const data=join(temp,'data');
let running=false;
function run(command,args,env,input) {
 const r=spawnSync(command,args,{env,input,encoding:'utf8',maxBuffer:16*1024*1024});
 if(r.status!==0) throw Error(`${command} failed during isolated recovery drill; diagnostics suppressed.`);
 return r.stdout.trim();
}
const query=(env,sql)=>run('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c',sql],env);
const snapshot=`select jsonb_build_object(
 'bookings', (select count(*) from aburii.bookings),
 'booking_digest',(select md5(coalesce(string_agg(to_jsonb(b)::text,'' order by id),'')) from aburii.bookings b),
 'settings_digest',(select md5(string_agg(to_jsonb(s)::text,'' order by id)) from aburii.settings s),
 'staff_digest',(select md5(coalesce(string_agg(to_jsonb(s)::text,'' order by user_id),'')) from aburii.staff s),
 'outbox_digest',(select md5(coalesce(string_agg(to_jsonb(o)::text,'' order by id),'')) from aburii.outbox o),
 'audit_digest',(select md5(coalesce(string_agg(to_jsonb(a)::text,'' order by id),'')) from aburii.audit a),
 'rls',(select jsonb_agg(jsonb_build_array(c.relname,c.relrowsecurity,(select jsonb_agg(jsonb_build_array(r,has_table_privilege(r,c.oid,'SELECT'),has_table_privilege(r,c.oid,'INSERT'),has_table_privilege(r,c.oid,'UPDATE'),has_table_privilege(r,c.oid,'DELETE')) order by r) from unnest(array['anon','authenticated','service_role','aburii_dev']) r)) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='aburii' and c.relkind='r'),
 'functions',(select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,p.proconfig,(select jsonb_agg(jsonb_build_array(r,has_function_privilege(r,p.oid,'EXECUTE')) order by r) from unnest(array['anon','authenticated','service_role','aburii_dev']) r)) order by n.nspname,p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aburii' or (n.nspname='public' and left(p.proname,7)='aburii_'))
);`;
try {
 if(!source.PGHOST.startsWith('/tmp/aburii-local-')||source.PGHOST!==c.socket) throw Error('Local-only source guard failed.');
 const identity=query(source,"select value from local_auth.metadata where key='identity';");
 if(identity!==c.databaseIdentity) throw Error('Unexpected local source identity.');
 if(query(source,"select count(*) from aburii.bookings where name not like 'DEMO %';")!=='0') throw Error('Source must contain synthetic reservations only.');
 const before=query(source,snapshot);
 const base=join(root,'.backups');
 mkdirSync(base,{recursive:true,mode:0o700});
 const info=lstatSync(base);
 if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==process.getuid()) throw Error('Unsafe backup directory.');
 chmodSync(base,0o700);
 const out=join(base,'local-drill-'+new Date().toISOString().replace(/[:.]/g,'-'));
 mkdirSync(out,{mode:0o700});
 const archive=join(out,'application.dump');
 run('pg_dump',['--no-password','--format=custom','--schema=aburii','--schema=auth','--schema=public','--file',archive],source);
 chmodSync(archive,0o600);
 run('pg_restore',['--list',archive],source);
 const target={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'en_US.UTF-8',PGHOST:temp,PGPORT:'55442',PGUSER:'aburii_dev',PGDATABASE:'postgres',PGTZ:'UTC',PGPASSFILE:'/dev/null',PGSERVICEFILE:'/dev/null'};
 run('initdb',['-D',data,'-A','trust','-U','aburii_dev','--no-locale','-E','UTF8'],target);
 run('pg_ctl',['-D',data,'-l',join(temp,'postgres.log'),'-o',`-h '' -p 55442 -k ${temp}`,'start'],target);
 running=true;
 query(target,'create role anon; create role authenticated; create role service_role;');
 if(target.PGHOST!==temp||!temp.includes('aburii-recovery-drill-')) throw Error('Unsafe restore destination.');
 run('pg_restore',['--no-password','--exit-on-error','--single-transaction','--clean','--if-exists','--dbname','postgres',archive],target);
 const restored=query(target,snapshot),after=query(source,snapshot);
 if(before!==restored||before!==after) { const a=JSON.parse(before),b=JSON.parse(restored); const fields=Object.keys(a).filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])); throw Error('Restore/source comparison failed; differing field labels: '+fields.join(',')+'; source unchanged: '+String(before===after)); }
 const report={source:'existing isolated synthetic local database, NOT Production',restoredTo:'disposable Unix-socket-only PostgreSQL cluster',archiveSha256:createHash('sha256').update(readFileSync(archive)).digest('hex'),archiveListingVerified:true,restoreSucceeded:true,dataRlsAndRpcAclComparisonPassed:true,sourceUnchanged:true,productionBackupCreated:false,productionArchiveRestoreVerified:false,scope:'Local application/auth scaffold backup; not a restore of Supabase managed services or extensions.'};
 writeFileSync(join(out,'recovery-report.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log('PASS: existing synthetic local archive restored; reservation/config/staff/outbox/audit digests, RLS and function ACLs match. Source unchanged.');
 console.log('Production backup and restore validation remain pending; this drill is not Production recovery evidence.');
} catch(error) {console.error(error instanceof Error?error.message:'Recovery drill failed; private data suppressed.');process.exitCode=1;}
finally {
 if(running) spawnSync('pg_ctl',['-D',data,'-m','fast','stop'],{stdio:'ignore'});
 rmSync(temp,{recursive:true,force:true});
}
