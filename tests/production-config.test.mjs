import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ABURII_PROJECT_REF, supabaseConfig, supabaseHeaders, productionIssues } from '../lib/supabase-config.mjs';
import { completeStaffPassword } from '../lib/staff-password.mjs';
const example = () => ({NODE_ENV:'production', ABURII_SUPABASE_URL:`https://${ABURII_PROJECT_REF}.supabase.co`, ABURII_SUPABASE_PROJECT_REF:ABURII_PROJECT_REF, ABURII_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_test_only', ABURII_SUPABASE_SECRET_KEY:'sb_secret_synthetic_test_only', ABURII_SITE_URL:'https://aburii.example', ABURII_RATE_LIMIT_SECRET:'synthetic-test-only-'.repeat(3)});
test('production is pinned to the owner-confirmed Aburii project, including when both URL and ref are changed', () => {
  assert.equal(ABURII_PROJECT_REF, 'oemwlqisfwrhfxsvuszi');
  assert.equal(productionIssues(example()).length, 0);
  for (const override of [
    {ABURII_SUPABASE_URL:'https://otherprojectonlytest.supabase.co', ABURII_SUPABASE_PROJECT_REF:'otherprojectonlytest'},
    {ABURII_SUPABASE_URL:`https://${ABURII_PROJECT_REF}.supabase.co.attacker.example`},
    {ABURII_SUPABASE_URL:`https://${ABURII_PROJECT_REF}.supabase.co/path`},
    {ABURII_SUPABASE_URL:`https://user:password@${ABURII_PROJECT_REF}.supabase.co`},
    {ABURII_SUPABASE_URL:`http://${ABURII_PROJECT_REF}.supabase.co`},
    {ABURII_SUPABASE_URL:`https://${ABURII_PROJECT_REF}.supabase.co?key=secret`},
    {ABURII_SUPABASE_PROJECT_REF:''}, {ABURII_LOCAL_DEVELOPMENT:'true'},
    {ABURII_SUPABASE_PUBLISHABLE_KEY:'legacy-jwt'}, {ABURII_SUPABASE_SECRET_KEY:'legacy-jwt'},
    {ABURII_SUPABASE_ANON_KEY:'legacy-key'}, {ABURII_SUPABASE_SERVICE_ROLE_KEY:'legacy-key'},
    {NEXT_PUBLIC_ABURII_SUPABASE_SECRET_KEY:'never-public'},
  ]) assert.throws(() => supabaseConfig({...example(), ...override}), /^Error: Aburii Supabase configuration is missing or invalid\.$/);
});
test('current API keys stay in apikey; only staff JWTs become Bearer tokens', () => {
  const config = supabaseConfig(example());
  assert.deepEqual(supabaseHeaders(config,'service'), {apikey:config.secret,'Content-Type':'application/json'});
  assert.deepEqual(supabaseHeaders(config,'auth'), {apikey:config.publishable,'Content-Type':'application/json'});
  const headers = supabaseHeaders(config,'staff','test.access.jwt');
  assert.equal(headers.apikey, config.publishable);
  assert.equal(headers.Authorization,'Bearer test.access.jwt');
  for (const token of [config.secret, config.publishable, undefined, 'invalid']) assert.throws(() => supabaseHeaders(config,'staff',token));
});
test('local adapter is limited to explicitly enabled non-production loopback; hosted config cannot inherit a local flag', () => {
  const env = {...example(), NODE_ENV:'development', ABURII_LOCAL_DEVELOPMENT:'true', ABURII_SUPABASE_URL:'http://127.0.0.1:3112', ABURII_SUPABASE_PUBLISHABLE_KEY:'local-anon-only', ABURII_SUPABASE_SECRET_KEY:'local-service-only'};
  assert.equal(supabaseConfig(env).local, true);
  assert.equal(supabaseHeaders(supabaseConfig(env),'auth').Authorization,'Bearer local-anon-only');
  for (const override of [{NODE_ENV:'production'}, {ABURII_LOCAL_DEVELOPMENT:'false'}, {ABURII_SUPABASE_URL:'http://192.0.2.1:3112'}, {ABURII_SUPABASE_URL:`https://${ABURII_PROJECT_REF}.supabase.co`}]) assert.throws(() => supabaseConfig({...env,...override}));
});
test('production origin and rate secret must be explicit; offline preflight does not leak supplied credentials', () => {
  for (const ABURII_SITE_URL of ['', 'http://aburii.example', 'https://aburii.example/', 'https://user:password@aburii.example']) assert.ok(productionIssues({...example(),ABURII_SITE_URL}).length);
  assert.ok(productionIssues({...example(),ABURII_RATE_LIMIT_SECRET:''}).length);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ABURII_') && !key.startsWith('NEXT_PUBLIC_ABURII_')));
  const child = spawnSync(process.execPath,['scripts/production-check.mjs'], {env:{...env,...example(),ABURII_SUPABASE_SECRET_KEY:'SENSITIVE_TEST_MARKER'},encoding:'utf8'});
  assert.equal(child.status,1);
  assert.match(child.stdout,/no remote requests made/);
  assert.ok(!(child.stdout+child.stderr).includes('SENSITIVE_TEST_MARKER'));
});
test('migration plan binds the approved project and all three unchanged migration checksums in order', () => {
  const plan = JSON.parse(readFileSync('supabase/migration-plan.json','utf8'));
  assert.equal(plan.projectReference, ABURII_PROJECT_REF);
  assert.deepEqual(plan.migrations.map(m=>m.file),['001_aburii.sql','002_staff_workspace.sql','003_operating_hours.sql']);
  for (const m of plan.migrations) assert.equal(createHash('sha256').update(readFileSync(`supabase/${m.file}`)).digest('hex'),m.sha256);
});
test('invite/recovery verifies Supabase identity and active membership before password update or session delivery', async () => {
  for (const type of ['invite','recovery']) {
    const calls=[];
    const session={access_token:'test.access.jwt',refresh_token:'synthetic-refresh',expires_in:3600};
    const input={token_hash:'a'.repeat(64),type,password:'synthetic-password-only'};
    const result=await completeStaffPassword(input,{
      auth:async(path,body)=>{calls.push([path,body]);return session;},
      member:async(token)=>{assert.equal(token,session.access_token);calls.push(['membership']);},
      user:async(path,body,token,method)=>{calls.push([path,body,method]);assert.equal(token,session.access_token);},
    });
    assert.deepEqual(calls,[['/auth/v1/verify',{token_hash:input.token_hash,type}],['membership'],['/auth/v1/user',{password:input.password},'PUT']]);
    assert.equal(result,session);
  }
});
test('expired invite, missing membership and failed password update never return a session', async () => {
  const session={access_token:'test.access.jwt',refresh_token:'synthetic-refresh',expires_in:3600};
  for (const failure of ['expired','membership','password']) {
    const paths=[];
    await assert.rejects(completeStaffPassword({token_hash:'a'.repeat(64),type:'invite',password:'synthetic-password-only'}, {
      auth:async()=>{if(failure==='expired') throw Error('Expired');return session;},
      member:async()=>{if(failure==='membership') throw Error('Denied');},
      user:async(path)=>{paths.push(path);if(path==='/auth/v1/user' && failure==='password') throw Error('Rejected');},
    }));
    if(failure==='expired') assert.deepEqual(paths,[]);
    if(failure==='membership') assert.deepEqual(paths,['/auth/v1/logout?scope=local']);
    if(failure==='password') assert.deepEqual(paths,['/auth/v1/user','/auth/v1/logout?scope=local']);
  }
});
