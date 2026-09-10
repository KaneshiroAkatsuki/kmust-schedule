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
