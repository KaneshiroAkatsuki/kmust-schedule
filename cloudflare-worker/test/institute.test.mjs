import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstituteService,createMemoryInstituteStore,validateFinance} from '../src/institute.mjs';
import {createApp,createMemoryStore} from '../src/index.mjs';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createD1InstituteStore} from '../src/institute.mjs';
const ORIGIN='https://schedule.test',PASSWORD='synthetic-test-password';
const sample=()=>({schemaVersion:1,source:{version:'test',file:'synthetic.xlsx',asOf:'2026-09-10'},opening:{availableCents:10000,lockedCents:0,asOf:'2026-09-10'},months:[{month:'2026-09',incomeCents:1000,expenseCents:500,balanceCents:10500,notes:'测试'}],items:[{id:'1',month:'2026-09',direction:'income',amountCents:1000,name:'测试收入'},{id:'2',month:'2026-09',direction:'expense',amountCents:500,name:'测试支出'}],rules:[]});
function fixture(){
  let time=new Date('2026-09-10T08:00:00Z');
  const store=createMemoryInstituteStore(),service=createInstituteService({store,checkPassword:async p=>p===PASSWORD,allowedOrigin:ORIGIN,now:()=>time});
  const req=(path,method='GET',body,token='',extra={})=>new Request('https://api.test'+path,{method,headers:{Origin:ORIGIN,...(token?{Authorization:'Bearer '+token}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
  const call=async(...args)=>{const response=await service.handle(req(...args));return {status:response.status,headers:response.headers,payload:await response.json()};};
  const login=async(id='browser-test-00000001',remember=false)=>{const r=await call('/api/auth/login','POST',{password:PASSWORD,browserId:id,name:'测试浏览器',remember});assert.equal(r.status,200);return r.payload.data;};
  return {store,service,req,call,login,setTime:t=>{time=new Date(t);}};
}
test('private endpoints reject absent, password and forged tokens without disclosing data',async()=>{
  const f=fixture();for(const token of ['',PASSWORD,'ys_'+'0'.repeat(64)])for(const path of ['/api/session','/api/sessions','/api/finance']){
    const r=await f.call(path,'GET',null,token);assert.equal(r.status,401);assert.equal(r.payload.data,undefined);assert.equal(r.headers.get('cache-control'),'no-store');
  }
  assert.equal((await f.call('/api/auth/login','POST',{password:PASSWORD,browserId:'browser-test-00000001'},'',{Origin:'https://attacker.test'})).status,403);
});
test('browser registration is network independent and stores only token hashes',async()=>{
  const f=fixture(),a=await f.login();assert.match(a.token,/^ys_[a-f0-9]{64}$/);
  const list=await f.call('/api/sessions','GET',null,a.token,{'CF-Connecting-IP':'203.0.113.7'});
  assert.equal(list.status,200);assert.equal(list.payload.data.length,1);assert.equal(list.payload.data[0].current,true);
  assert.ok(!JSON.stringify(list.payload).includes(a.token));assert.ok(!JSON.stringify(list.payload).includes('token_hash'));
  assert.equal(await f.store.find(a.token),undefined);
  assert.equal((await f.call('/api/session','GET',null,a.token,{'CF-Connecting-IP':'198.51.100.9'})).status,200);
});
test('revoking another browser or current browser invalidates the session, without deleting finance',async()=>{
  const f=fixture(),a=await f.login(),b=await f.login('browser-test-00000002',true);
  await f.call('/api/finance','PUT',{baseRevision:0,document:sample()},a.token);
  assert.equal((await f.call('/api/sessions','POST',{action:'revoke',id:b.id},a.token)).status,200);
  assert.equal((await f.call('/api/finance','GET',null,b.token)).status,401);
  assert.equal((await f.call('/api/finance','GET',null,a.token)).payload.data.revision,1);
  await f.call('/api/sessions','POST',{action:'revoke',id:a.id},a.token);
  assert.equal((await f.call('/api/session','GET',null,a.token)).status,401);
  assert.equal((await f.store.getFinance()).revision,1);
});
test('relogin replaces same-browser session; another browser gets independent registration and names',async()=>{
  const f=fixture(),old=await f.login(),current=await f.login();
  assert.equal(await f.service.authenticate(old.token),null);
  assert.equal((await f.call('/api/sessions','GET',null,current.token)).payload.data.length,1);
  await f.call('/api/sessions','POST',{action:'rename',id:current.id,name:'我的手机'},current.token);
  assert.equal((await f.call('/api/session','GET',null,current.token)).payload.data.name,'我的手机');
  await f.login('browser-test-00000002');
  assert.equal((await f.call('/api/sessions','GET',null,current.token)).payload.data.length,2);
});
test('sessions expire and remembered sessions are still revocable',async()=>{
  const f=fixture(),a=await f.login(),b=await f.login('browser-test-00000002',true);
  f.setTime('2026-09-12T08:00:00Z');assert.equal(await f.service.authenticate(a.token),null);assert.ok(await f.service.authenticate(b.token));
  f.setTime('2027-01-12T08:00:00Z');assert.equal(await f.service.authenticate(b.token),null);
});
test('password checking rate limit also covers legacy verification',async()=>{
  const f=fixture();for(let i=0;i<20;i++)assert.equal(await f.service.checkLegacyPassword('wrong',f.req('/api/auth/verify','POST',{})),false);
  assert.equal((await f.call('/api/auth/login','POST',{password:PASSWORD,browserId:'browser-test-00000001'})).status,429);
});
test('finance snapshots reconcile cents, reject malformed data and protect concurrent imports',async()=>{
  const f=fixture(),a=await f.login();const doc=sample();
  assert.equal((await f.call('/api/finance','PUT',{baseRevision:0,document:doc},a.token)).status,200);
  assert.equal((await f.call('/api/finance','PUT',{baseRevision:0,document:doc},a.token)).status,409);
  doc.months[0].incomeCents++;assert.throws(()=>validateFinance(doc),/不一致/);
  doc.items[0].amountCents=1.2;assert.throws(()=>validateFinance(doc),/整数分/);
  assert.equal((await f.call('/api/finance','GET',null,a.token)).payload.data.document.items[0].amountCents,1000);
});
test('revoked browser cannot use schedule writes or legacy verify as a token fallback',async()=>{
  const f=fixture(),a=await f.login();const app=createApp({store:createMemoryStore(),adminSecret:PASSWORD,allowedOrigin:ORIGIN,sessionService:f.service});
  let r=await app.fetch(f.req('/api/auth/verify','POST',{},a.token));assert.equal(r.status,200);
  await f.store.revoke(a.id);
  r=await app.fetch(f.req('/api/auth/verify','POST',{},a.token));assert.equal(r.status,401);
  r=await app.fetch(f.req('/api/schedule','POST',{auth:a.token,baseRevision:0,courses:[]}));assert.equal(r.status,401);
});

test('D1 migration and SQL store support real SQLite session revocation and budget compare-and-swap',async()=>{
  const sqlite=new DatabaseSync(':memory:');
  const migration=fs.readFileSync(new URL('../migrations/0003_institute_sessions_finance.sql',import.meta.url),'utf8');
  sqlite.exec(migration);sqlite.exec(migration);
  const db={prepare(sql){let params=[];return {bind(...values){params=values;return this;},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}};},async first(){return sqlite.prepare(sql).get(...params)||null;},async all(){return {results:sqlite.prepare(sql).all(...params)};}};},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const store=createD1InstituteStore(db),now=new Date().toISOString(),later=new Date(Date.now()+86400000).toISOString();
  assert.equal(await store.limit('test',Date.now()+10000),1);assert.equal(await store.limit('test',Date.now()+10000),2);
  await store.create({id:'first',browser_id:'test-browser',token_hash:'hash-first',name:'测试',created_at:now,last_seen:now,expires_at:later});
  await store.create({id:'second',browser_id:'test-browser',token_hash:'hash-second',name:'测试',created_at:now,last_seen:now,expires_at:later});
  assert.equal((await store.find('hash-first')).revoked,1);assert.equal((await store.list(now)).length,1);
  await store.rename('second','备注');assert.equal((await store.find('hash-second')).name,'备注');
  await store.revoke('second');assert.equal((await store.list(now)).length,0);
  assert.equal(await store.putFinance(0,sample(),now),true);assert.equal(await store.putFinance(0,sample(),now),false);
  assert.equal(await store.putFinance(1,sample(),now),true);assert.equal((await store.getFinance()).revision,2);
  sqlite.close();
});

test('oversized private imports are rejected before storage',async()=>{
  const f=fixture(),a=await f.login();
  const response=await f.service.handle(f.req('/api/finance','PUT',{data:'x'.repeat(513000)},a.token));
  assert.equal(response.status,422);assert.equal(await f.store.getFinance(),null);
});
