// Private budget publishing uses the site login, not Cloudflare deployment credentials.
// This script contains no private data and never writes credentials or snapshots to disk.
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
import {validateFinance} from '../cloudflare-worker/src/institute.mjs';

const ENDPOINT='https://yuheng-institute-gateway.pages.dev';
const ORIGIN='https://kaneshiroakatsuki.github.io';
const LIMIT=512000;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function compareSnapshot(document,current) {
  if(!current)return {identical:false};
  if(equal(document,validateFinance(current.document)))return {identical:true};
  const number=v=>/^v?(\d+)$/i.exec(v)?.[1];
  const next=number(document.source.version),old=number(current.document.source.version);
  if(!next||!old||BigInt(next)<=BigInt(old))throw new Error('快照必须使用高于云端的新版本号；不覆盖同版或较新预算。');
  return {identical:false};
}

export async function publishFinance({document,password,mode='check',expectedRevision,fetchImpl=fetch}) {
  const clean=validateFinance(document);
  if(!clean.source.version||!clean.months.length)throw new Error('缺少预算版本或月份。');
  if(Buffer.byteLength(JSON.stringify({baseRevision:0,document:clean}))>LIMIT)throw new Error('预算快照过大。');
  if(!['check','publish'].includes(mode))throw new Error('操作模式无效。');
  if(mode==='publish'&&(!Number.isSafeInteger(expectedRevision)||expectedRevision<0))throw new Error('发布必须明确指定核对时的云端修订号。');
  if(typeof password!=='string'||!/^\d{1,128}$/.test(password))throw new Error('需要有效的网站数字密码。');
  let session=null,result,failure=null,cleanupFailed=false;
  async function request(path,method='GET',body,anonymous=false) {
    const response=await fetchImpl(ENDPOINT+path,{method,redirect:'error',cache:'no-store',headers:{Origin:ORIGIN,'Content-Type':'application/json',...(!anonymous&&session?{Authorization:'Bearer '+session.token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    const payload=await response.json().catch(()=>null);
    if(!response.ok||!payload?.ok){const messages={401:'网站登录已失效或密码不正确。',409:'云端版本已变化，未覆盖，请重新核对。',429:'登录尝试过于频繁，请稍后重试。'};throw new Error(messages[response.status]||'接口检查失败（HTTP '+response.status+'），请核对后重试。');}
    return payload.data;
  }
  try {
    session=await request('/api/auth/login','POST',{password,browserId:crypto.randomUUID(),name:'预算发布 · 临时核对',remember:false},true);
    password='';
    if(!session?.id||!/^ys_[a-f0-9]{64}$/.test(session.token||''))throw new Error('登录响应不完整。');
    const current=await request('/api/finance');
    const revision=current?.revision||0;
    if(mode==='publish'&&revision!==expectedRevision)throw new Error('云端版本已变化，未覆盖，请重新核对。');
    const {identical}=compareSnapshot(clean,current);
    result={mode,status:identical?'already-current':'checked',revision,version:clean.source.version,months:clean.months.length,items:clean.items.length};
    if(mode==='publish'&&!identical){
      await request('/api/finance','PUT',{baseRevision:expectedRevision,document:clean});
      const readback=await request('/api/finance');
      if(readback?.revision!==expectedRevision+1||!equal(validateFinance(readback.document),clean))throw new Error('上传后读回不一致或已有后续修改，请人工核对，不要盲目重试。');
      result={...result,status:'published-and-verified',revision:readback.revision,updatedAt:readback.updatedAt};
    }
  }catch(error){failure=error instanceof Error?error:new Error('预算核对失败。');}
  finally {
    password='';
    if(session?.token&&session?.id){
      try{await request('/api/sessions','POST',{action:'revoke',id:session.id});}catch{cleanupFailed=true;}
      session=null;
    }
  }
  if(failure)throw new Error(failure.message+(cleanupFailed?' 临时登录撤销未确认，请在设置中检查。':''));
  return {...result,temporaryLoginRevoked:!cleanupFailed};
}

async function readPassword() {
  const tty=Boolean(process.stdin.isTTY);
  if(tty)process.stdin.setRawMode(true);
  const reader=createInterface({input:process.stdin,terminal:false});
  process.stderr.write('请输入网站密码（不显示、不保存），然后回车：\n');
  try{for await(const line of reader)return line.trim();throw new Error('没有收到密码。');}
  finally{reader.close();if(tty)process.stdin.setRawMode(false);}
}
async function main() {
  const args=process.argv.slice(2),file=args.find(a=>!a.startsWith('--'));
  if(!file||args.includes('--help')){console.log('用法：node scripts/publish-finance.mjs <私有快照绝对路径> [--check | --publish --expected-revision=N]');return;}
  if(args.some(a=>a.startsWith('--')&&!/^--(check|publish|expected-revision=\d+)$/.test(a)))throw new Error('参数无效。密码只能通过隐藏输入提供，不能作为命令参数。');
  if(args.includes('--check')&&args.includes('--publish'))throw new Error('请选择一种操作模式。');
  if((await fs.stat(file)).size>LIMIT)throw new Error('预算文件过大。');
  const document=validateFinance(JSON.parse(await fs.readFile(file,'utf8')));
  const revision=args.find(a=>a.startsWith('--expected-revision='))?.split('=')[1];
  const result=await publishFinance({document,password:await readPassword(),mode:args.includes('--publish')?'publish':'check',expectedRevision:revision===undefined?undefined:Number(revision)});
  console.log(JSON.stringify(result));
  if(!result.temporaryLoginRevoked)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.name==='SyntaxError'?'预算文件格式无效。':error.message);process.exitCode=1;});
