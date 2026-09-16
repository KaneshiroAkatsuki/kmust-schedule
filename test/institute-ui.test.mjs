import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../assets/institute.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../assets/institute.css',import.meta.url),'utf8');
test('unified application provides one settings page, three module tabs and one shared login',()=>{
  for(const id of ['financePage','settingsPage','suiteVersion','financeStatus','sessionList','settingsLogout','financeImport','financeExport'])assert.equal(html.split('id="'+id+'"').length-1,1,id);
  assert.equal(html.split('id="loginForm"').length-1,1);
  assert.match(js,/window\.Institute=/);
  assert.match(html,/window\.Institute\.setupLogin\(\)/);
  assert.match(html,/window\.Institute\.token\(\)/);
});
test('financial UI does not embed private data and distinguishes forecast and historical balance',()=>{
  assert.doesNotMatch(js,/budget_v171|114514|finance-snapshot\.json/);
  assert.match(js,/非实时余额/);assert.match(js,/Excel 为主账本/);
  assert.match(js,/await request\('\/api\/finance'\)/);
  assert.doesNotMatch(js,/write\([^\n]*finance/);
  assert.match(js,/authEpoch/);assert.match(js,/clearLocal\(\)/);
});
test('browser naming is coarse and does not inspect IP, VPN or hardware fingerprints',()=>{
  for(const [ua,label] of [['Mozilla Android Chrome/123','Android · Chrome'],['Mozilla Windows Chrome/123 Edg/123','Windows · Edge'],['Mozilla iPhone Safari/123','iOS · Safari']]){
    const sandbox={window:{},navigator:{userAgent:ua}};vm.runInNewContext(js,sandbox);
    assert.equal(sandbox.window.Institute.browserName(),label);assert.equal(sandbox.window.Institute.token(),'');
  }
  assert.match(js,/crypto\.randomUUID\(\)/);
  assert.doesNotMatch(js,/webgl|canvas\.toDataURL|ipify|api\.ip|hardwareConcurrency/);
});
test('mobile navigation and finance layout use flexible widths and respect reduced motion',()=>{
  assert.match(css,/@media\(max-width:800px\)/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.suite-nav-tabs button \{ flex:1;min-width:0/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/suite-reduced-motion/);
});

function financeView(document){
  const nodes={financeContent:{innerHTML:'',querySelectorAll:()=>[]},financeMonth:{value:'2026-09',addEventListener(){}},financeMonthDetail:{innerHTML:''},financePrev:{},financeNext:{}};
  const sandbox={window:{},document:{getElementById:id=>nodes[id]}};
  vm.runInNewContext(js.replace('window.Institute={init,','window.Institute={setFinance:d=>{finance={document:d};},renderFinance,renderFinanceMonth,'),sandbox);
  sandbox.window.Institute.setFinance(document);
  return {nodes,view:sandbox.window.Institute};
}
const synthetic=()=>({source:{version:'test',file:'synthetic.xlsx'},opening:{asOf:'2026-09-01',availableCents:10000,lockedCents:2000},months:[{month:'2026-09',incomeCents:1000,expenseCents:12000,balanceCents:-1000,notes:'月度说明'},{month:'2026-10',incomeCents:0,expenseCents:0,balanceCents:1000,notes:'资金释放'}],items:[{id:'a',month:'2026-09',direction:'income',name:'测试收入',amountCents:1000},{id:'b',month:'2026-09',direction:'expense',name:'<img src=x>',amountCents:12000,notes:'<script>unsafe</script>'}],rules:[]});
test('private pinned rules appear above balances, escape content and do not repeat in collapsed rules',()=>{
  const d=synthetic();d.rules=['置顶提示：测试提醒 <img src=x>','普通说明'];
  const {nodes,view}=financeView(d);view.renderFinance();const output=nodes.financeContent.innerHTML;
  assert(output.indexOf('finance-notice')<output.indexOf('finance-kpis'));
  assert.match(output,/<section[^>]*finance-notice/);assert.match(output,/特别提示 · 给我自己看/);
  assert.match(output,/测试提醒 &lt;img src=x&gt;/);assert.doesNotMatch(output,/<img src=x>/);
  assert.equal(output.split('测试提醒').length-1,1);assert.match(output,/普通说明/);
  d.rules=[];view.renderFinance();assert.doesNotMatch(nodes.financeContent.innerHTML,/finance-notice/);
  assert.match(css,/\.finance-notice p \{[^}]*overflow-wrap:anywhere/);
});
test('finance separates plans, explicitly labels shortfalls and escapes all notes',()=>{
  const {nodes,view}=financeView(synthetic());view.renderFinance();
  assert.match(nodes.financeContent.innerHTML,/最大月末缺口/);
  assert.match(nodes.financeContent.innerHTML,/aria-label="2026-09，缺口/);
  assert.match(nodes.financeMonthDetail.innerHTML,/预计缺口/);
  assert.match(nodes.financeMonthDetail.innerHTML,/计划收入/);assert.match(nodes.financeMonthDetail.innerHTML,/计划支出/);
  assert.match(nodes.financeMonthDetail.innerHTML,/&lt;img/);assert.doesNotMatch(nodes.financeMonthDetail.innerHTML,/<script>/);
  assert.equal(nodes.financePrev.disabled,true);assert.equal(nodes.financeNext.disabled,false);
});
test('month selection scopes ledger and exposes non-income balance adjustments',()=>{
  const {nodes,view}=financeView(synthetic());nodes.financeMonth.value='2026-10';view.renderFinanceMonth();
  assert.doesNotMatch(nodes.financeMonthDetail.innerHTML,/测试收入/);
  assert.match(nodes.financeMonthDetail.innerHTML,/其他余额调整/);
  assert.match(nodes.financeMonthDetail.innerHTML,/暂无计划收入/);
  assert.match(nodes.financeMonthDetail.innerHTML,/预计结余/);
  assert.equal(nodes.financePrev.disabled,false);assert.equal(nodes.financeNext.disabled,true);
});
test('zero balances are not presented as deficits',()=>{
  const d=synthetic();d.months[0].balanceCents=0;
  const {nodes,view}=financeView(d);view.renderFinance();
  assert.doesNotMatch(nodes.financeMonthDetail.innerHTML,/预计缺口/);
  assert.match(nodes.financeMonthDetail.innerHTML,/预计结余/);
  assert.doesNotMatch(nodes.financeContent.innerHTML,/最大月末缺口/);
});
test('separate opening accounts are visible without double counting',()=>{
  const d=synthetic();d.opening.accounts=[{name:'现金测试',amountCents:8000},{name:'餐饮账户测试',amountCents:2000}];
  const {nodes,view}=financeView(d);view.renderFinance();
  assert.match(nodes.financeContent.innerHTML,/现金测试/);assert.match(nodes.financeContent.innerHTML,/餐饮账户测试/);
  assert.match(nodes.financeContent.innerHTML,/合计/);
  assert.match(nodes.financeMonthDetail.innerHTML,/基准可用余额<b>¥100.00/);
});
