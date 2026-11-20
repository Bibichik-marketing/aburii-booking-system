import {test} from 'node:test';
import assert from 'node:assert/strict';
import {upstreamError} from '../lib/upstream-errors.mjs';
import {translateError} from '../lib/i18n.mjs';
test('invalid password is distinct from key, provider and network service errors',()=>{
 assert.equal(upstreamError('auth',400,{code:400,error_code:'invalid_credentials',msg:'Invalid login credentials'}).code,'INVALID_CREDENTIALS');
 assert.equal(upstreamError('auth',401,{}).code,'AUTH_CONFIGURATION');
 assert.equal(upstreamError('auth',400,{code:'email_provider_disabled'}).status,503);
 assert.equal(upstreamError('auth',500,{}).code,'AUTH_SERVICE');
 assert.equal(upstreamError('auth',429,{}).status,429);
});
test('staff authorization is distinct from a server key failure',()=>{
 assert.equal(upstreamError('staff',403,{code:'42501'}).code,'STAFF_ACCESS');
 assert.equal(upstreamError('service',401,{}).code,'SERVER_CONFIGURATION');
 assert.equal(upstreamError('service',400,{}),null);
});
test('upstream secrets and arbitrary errors never enter safe output; errors are bilingual',()=>{
 for(const mode of ['auth','staff','service']){
  const r=upstreamError(mode,401,{message:'private-value',code:'private-value'});
  assert.ok(!JSON.stringify(r).includes('private-value'));
  assert.notEqual(translateError('zh-CN',r.message),'请检查所填资料后重试。');
 }
 assert.equal(upstreamError('auth',400,{code:'refresh_token_not_found'}).code,'SESSION_EXPIRED');
});
