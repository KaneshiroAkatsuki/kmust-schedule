const PRIVATE_PATHS = new Set(['/api/auth/login','/api/session','/api/sessions','/api/finance']);
const DAY = 86400000;
const LIMIT = 512000;
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const randomToken = () => 'ys_'+Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const text = (value,max=120) => typeof value === 'string' ? value.trim().slice(0,max) : '';

export function validateFinance(input) {
  if (!input || input.schemaVersion !== 1 || !input.source || !Array.isArray(input.months) || !Array.isArray(input.items)) throw new Error('预算文件格式不正确');
  const money = value => { if (!Number.isSafeInteger(value) || Math.abs(value)>1e12) throw new Error('金额必须使用整数分'); return value; };
  const monthKey = value => { if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('月份格式不正确'); return value; };
  if(input.months.length>120 || input.items.length>3000) throw new Error('预算记录过多');
  const months=input.months.map(m=>({month:monthKey(m.month),incomeCents:money(m.incomeCents),expenseCents:money(m.expenseCents),balanceCents:money(m.balanceCents),notes:text(m.notes,1000)}));
  if(new Set(months.map(m=>m.month)).size!==months.length) throw new Error('月份重复');
  const items=input.items.map((i,index)=>({id:text(i.id,80)||String(index),month:monthKey(i.month),name:text(i.name),category:text(i.category,80),direction:i.direction==='income'?'income':i.direction==='expense'?'expense': (()=>{throw new Error('收支类型不正确');})(),amountCents:money(i.amountCents),notes:text(i.notes,1000)}));
  if(items.some(i=>i.amountCents<0 || !months.some(m=>m.month===i.month))) throw new Error('明细金额或月份不正确');
  if(new Set(items.map(i=>i.id)).size!==items.length) throw new Error('明细编号重复');
  for(const m of months) {
    for(const [direction,field] of [['income','incomeCents'],['expense','expenseCents']]) {
      if(items.filter(i=>i.month===m.month&&i.direction===direction).reduce((s,i)=>s+i.amountCents,0)!==m[field]) throw new Error('月度合计与明细不一致：'+m.month);
    }
  }
  const opening={availableCents:money(input.opening?.availableCents),lockedCents:money(input.opening?.lockedCents),asOf:text(input.opening?.asOf,40)};
  return {schemaVersion:1,source:{version:text(input.source.version,80),file:text(input.source.file,160),asOf:text(input.source.asOf,40)},opening,months,items,rules:(Array.isArray(input.rules)?input.rules:[]).slice(0,30).map(r=>text(r,1000))};
}

export function createMemoryInstituteStore() {
  const sessions=new Map(),limits=new Map();let finance=null;
  return {
    async limit(bucket,expires){const n=(limits.get(bucket)||0)+1;limits.set(bucket,n);return n;},
    async create(s){for(const old of sessions.values())if(old.browser_id===s.browser_id)old.revoked=1;sessions.set(s.id,{...s});},
    async find(tokenHash){return [...sessions.values()].find(s=>s.token_hash===tokenHash);},
    async touch(id,date){const s=sessions.get(id);if(s)s.last_seen=date;},
    async list(now){return [...sessions.values()].filter(s=>!s.revoked&&s.expires_at>now).map(s=>({...s}));},
    async revoke(id){const s=sessions.get(id);if(s)s.revoked=1;},
    async rename(id,name){const s=sessions.get(id);if(s)s.name=name;},
    async getFinance(){return finance;},
    async putFinance(base,doc,at){if((finance?.revision||0)!==base)return false;finance={revision:base+1,updatedAt:at,document:structuredClone(doc)};return true;}
  };
}

export function createD1InstituteStore(db) {
  return {
    async limit(bucket,expires){
      await db.prepare('DELETE FROM institute_login_limits WHERE expires < ?').bind(Date.now()).run();
      return (await db.prepare('INSERT INTO institute_login_limits(bucket,attempts,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket,expires).first()).attempts;
    },
    async create(s){await db.batch([
      db.prepare('DELETE FROM institute_sessions WHERE expires_at < ? OR revoked = 1').bind(s.created_at),
      db.prepare('UPDATE institute_sessions SET revoked=1 WHERE browser_id=?').bind(s.browser_id),
      db.prepare('INSERT INTO institute_sessions(id,browser_id,token_hash,name,created_at,last_seen,expires_at,revoked) VALUES(?,?,?,?,?,?,?,0)').bind(s.id,s.browser_id,s.token_hash,s.name,s.created_at,s.last_seen,s.expires_at)
    ]);},
    async find(h){return db.prepare('SELECT * FROM institute_sessions WHERE token_hash=?').bind(h).first();},
    async touch(id,at){await db.prepare('UPDATE institute_sessions SET last_seen=? WHERE id=? AND revoked=0').bind(at,id).run();},
    async list(now){return (await db.prepare('SELECT id,name,created_at,last_seen,expires_at FROM institute_sessions WHERE revoked=0 AND expires_at>? ORDER BY last_seen DESC LIMIT 100').bind(now).all()).results;},
    async revoke(id){await db.prepare('UPDATE institute_sessions SET revoked=1 WHERE id=?').bind(id).run();},
    async rename(id,name){await db.prepare('UPDATE institute_sessions SET name=? WHERE id=? AND revoked=0').bind(name,id).run();},
    async getFinance(){const r=await db.prepare('SELECT * FROM institute_finance WHERE id=1').first();return r?{revision:r.revision,updatedAt:r.updated_at,document:JSON.parse(r.document_json)}:null;},
    async putFinance(base,doc,at){
      const result=base===0?await db.prepare('INSERT OR IGNORE INTO institute_finance(id,revision,updated_at,document_json) VALUES(1,1,?,?)').bind(at,JSON.stringify(doc)).run():await db.prepare('UPDATE institute_finance SET revision=revision+1,updated_at=?,document_json=? WHERE id=1 AND revision=?').bind(at,JSON.stringify(doc),base).run();
      return result.meta.changes===1;
    }
  };
}

export function createInstituteService({store,checkPassword,allowedOrigin,now=()=>new Date()}) {
  async function allowPasswordAttempt(request) {
    const windowId=Math.floor(now().getTime()/900000);
    const bucket=await hash((request.headers.get('CF-Connecting-IP')||'gateway')+'|'+windowId);
    return await store.limit(bucket,(windowId+1)*900000)<=20;
  }
  async function authenticate(token) {
    if(!/^ys_[a-f0-9]{64}$/.test(token||''))return null;
    const session=await store.find(await hash(token)),at=now();
    if(!session||session.revoked||session.expires_at<=at.toISOString())return null;
    if(at.getTime()-new Date(session.last_seen).getTime()>60000)await store.touch(session.id,at.toISOString());
    return session;
  }
  function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Vary':'Origin'}});}
  const fail=(code,message,status)=>json({ok:false,error:{code,message}},status);
  async function body(request){
    if(Number(request.headers.get('Content-Length'))>LIMIT)throw new Error('请求内容过大');
    const reader=request.body?.getReader();if(!reader)throw new Error('数据格式不正确');
    const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT){await reader.cancel();throw new Error('请求内容过大');}chunks.push(value);}
    const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder().decode(joined));}catch{throw new Error('数据格式不正确');}
  }
  return {
    authenticate,
    async checkLegacyPassword(token,request) { return await allowPasswordAttempt(request) && await checkPassword(token); },
    async handle(request) {
      const path=new URL(request.url).pathname;
      if(!PRIVATE_PATHS.has(path))return null;
      if(request.headers.get('Origin')!==allowedOrigin)return fail('ORIGIN_DENIED','来源不允许',403);
      if(request.method==='OPTIONS')return json({ok:true});
      try {
        if(path==='/api/auth/login') {
          if(request.method!=='POST')return fail('METHOD_NOT_ALLOWED','请求方法不允许',405);
          const at=now();
          if(!await allowPasswordAttempt(request))return fail('RATE_LIMITED','尝试过于频繁，请15分钟后再试',429);
          const input=await body(request);
          if(typeof input.password!=='string'||input.password.length>128||!await checkPassword(input.password))return fail('UNAUTHORIZED','账号或密码错误',401);
          if(!/^[a-zA-Z0-9-]{16,80}$/.test(input.browserId||''))return fail('INVALID_BROWSER','浏览器标识无效',422);
          const token=randomToken(),id=crypto.randomUUID(),expiresAt=new Date(at.getTime()+(input.remember===true?90:1)*DAY).toISOString();
          await store.create({id,browser_id:input.browserId,token_hash:await hash(token),name:text(input.name,60)||'浏览器',created_at:at.toISOString(),last_seen:at.toISOString(),expires_at:expiresAt,revoked:0});
          return json({ok:true,data:{token,id,expiresAt}});
        }
        const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
        const session=await authenticate(token);
        if(!session)return fail('SESSION_EXPIRED','登录已失效，请重新登录',401);
        if(path==='/api/session') {
          if(request.method!=='GET')return fail('METHOD_NOT_ALLOWED','请求方法不允许',405);
          return json({ok:true,data:{id:session.id,name:session.name,expiresAt:session.expires_at}});
        }
        if(path==='/api/sessions') {
          if(request.method==='GET')return json({ok:true,data:(await store.list(now().toISOString())).map(s=>({id:s.id,name:s.name,createdAt:s.created_at,lastSeen:s.last_seen,expiresAt:s.expires_at,current:s.id===session.id}))});
          if(request.method!=='POST')return fail('METHOD_NOT_ALLOWED','请求方法不允许',405);
          const input=await body(request);
          if(typeof input.id!=='string'||input.id.length>80)return fail('INVALID_SESSION','登录记录无效',422);
          if(input.action==='revoke')await store.revoke(input.id);
          else if(input.action==='rename'&&text(input.name,60))await store.rename(input.id,text(input.name,60));
          else return fail('INVALID_ACTION','操作无效',422);
          return json({ok:true});
        }
        if(path==='/api/finance') {
          if(request.method==='GET')return json({ok:true,data:await store.getFinance()});
          if(request.method!=='PUT')return fail('METHOD_NOT_ALLOWED','请求方法不允许',405);
          const input=await body(request);
          if(!Number.isSafeInteger(input.baseRevision)||input.baseRevision<0)return fail('INVALID_REVISION','版本号无效',422);
          const doc=validateFinance(input.document);
          if(!await store.putFinance(input.baseRevision,doc,now().toISOString()))return fail('REVISION_CONFLICT','预算已更新，请重新读取后再导入',409);
          return json({ok:true,data:await store.getFinance()});
        }
      } catch(error) {
        // Do not log request bodies, passwords, tokens or private budget data.
        if(error instanceof Error && /格式|金额|月份|记录|明细|合计|预算|请求内容/.test(error.message))return fail('VALIDATION_ERROR',error.message,422);
        return fail('SERVICE_UNAVAILABLE','服务暂时不可用，请稍后重试',503);
      }
    }
  };
}
