// Read-only Production export only. There is deliberately no remote restore mode.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, lstatSync, chmodSync, writeFileSync, readFileSync, createReadStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { ABURII_PROJECT_REF } from '../../lib/supabase-config.mjs';
const root=resolve(import.meta.dirname,'../..');
const base=join(root,'.backups');
async function checksum(path) { const hash=createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); }
function directory(path) {
 mkdirSync(path,{recursive:true,mode:0o700});
 const s=lstatSync(path);
 if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==process.getuid()) throw Error('Unsafe backup directory');
 chmodSync(path,0o700);
}
function run(command,args,env) {
 const result=spawnSync(command,args,{env,encoding:'utf8',maxBuffer:16*1024*1024});
 if(result.status!==0) throw Error(`${command} failed; check database access, TLS trust, tool version and export privileges privately. Raw diagnostics suppressed.`);
 return result.stdout;
}
try {
 const file=lstatSync(join(root,'.env.backup.local'));
 if(!file.isFile()||file.isSymbolicLink()||file.uid!==process.getuid()||(file.mode&0o777)!==0o600) throw Error('Backup environment must be an owner-only regular file.');
 const p=process.env, host=p.ABURII_BACKUP_DB_HOST, user=p.ABURII_BACKUP_DB_USER;
 const direct=host===`db.${ABURII_PROJECT_REF}.supabase.co`&&user==='postgres';
 const session=/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host||'')&&user===`postgres.${ABURII_PROJECT_REF}`;
 if(p.ABURII_BACKUP_PROJECT_REF!==ABURII_PROJECT_REF||(!direct&&!session)||p.ABURII_BACKUP_DB_PORT!=='5432'||p.ABURII_BACKUP_DB_NAME!=='postgres') throw Error('Backup destination is not pinned to the Aburii project/direct or session connection.');
 if(!p.ABURII_BACKUP_DB_PASSWORD) throw Error('Database password is not configured. API keys cannot replace the PostgreSQL password.');
 if(!p.ABURII_BACKUP_SSL_ROOT_CERT) throw Error('Configure TLS root certificate trust; verify-full is required.');
 // No inherited PG*, service files, generic URLs or application integration secrets.
 const env={PATH:p.PATH,HOME:p.HOME,LANG:'en_US.UTF-8',PGHOST:host,PGPORT:'5432',PGUSER:user,PGDATABASE:'postgres',PGPASSWORD:p.ABURII_BACKUP_DB_PASSWORD,PGSSLMODE:'verify-full',PGSSLROOTCERT:p.ABURII_BACKUP_SSL_ROOT_CERT,PGPASSFILE:'/dev/null',PGSERVICEFILE:'/dev/null',PGCONNECT_TIMEOUT:'15',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=0 -c lock_timeout=5000'};
 const metadata=JSON.parse(run('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-c',"select json_build_object('server_version',current_setting('server_version'),'read_only',current_setting('default_transaction_read_only'),'auth_users_exists',to_regclass('auth.users') is not null,'aburii_exists',to_regnamespace('aburii') is not null);"],env));
 if(metadata.read_only!=='on'||!metadata.auth_users_exists) throw Error('Unexpected database identity/prerequisites.');
 directory(base);
 const out=join(base,'production-'+new Date().toISOString().replace(/[:.]/g,'-'));
 directory(out);
 const archive=join(out,'database.dump'),roles=join(out,'roles-no-passwords.sql');
 run('pg_dump',['--no-password','--format=custom','--file',archive,'--lock-wait-timeout=5s'],env);
 chmodSync(archive,0o600);
 writeFileSync(roles,run('pg_dumpall',['--no-password','--roles-only','--no-role-passwords'],env),{mode:0o600});
 const toc=run('pg_restore',['--list',archive],{PATH:p.PATH,HOME:p.HOME});
 if(!toc.includes('Dumped from database version')) throw Error('Archive listing is invalid.');
 const manifest={project:ABURII_PROJECT_REF,createdAt:new Date().toISOString(),source:metadata,archive:'database.dump',archiveSha256:await checksum(archive),roles:'roles-no-passwords.sql',rolesSha256:createHash('sha256').update(readFileSync(roles)).digest('hex'),archiveListingVerified:true,productionArchiveRestoreVerified:false,scope:'Native full-database logical dump plus password-free role definitions; not Supabase Auth/SMTP/API settings, storage object bytes, Vault root keys or a physical/PITR backup.'};
 writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
 console.log('PASS: read-only Aburii export, archive listing and SHA-256 checks. Files are private under .backups/.');
 console.log('HOLD: this archive still requires an isolated Supabase-compatible restore drill and protected off-device copy before migration GO.');
} catch(error) { console.error(error instanceof Error?error.message:'Backup failed; credentials suppressed.');process.exitCode=1; }
