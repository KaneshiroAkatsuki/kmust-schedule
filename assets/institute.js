(function () {
  'use strict';
  const KEY='yuheng-session-v1',BROWSER='yuheng-browser-id',PREFS='yuheng-preferences';
  let bridge={},auth=null,finance=null,active='schedule',busy=false,authEpoch=0;
  const scrolls={schedule:0,finance:0,settings:0};
  const $=id=>document.getElementById(id);
  const escape=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function read(storage,key){try{return JSON.parse(storage.getItem(key)||'null');}catch{return null;}}
  function write(storage,key,value){try{if(value===null)storage.removeItem(key);else storage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
  function browserId(){let id=read(localStorage,BROWSER);if(!/^[a-zA-Z0-9-]{16,80}$/.test(id||'')){id=crypto.randomUUID();write(localStorage,BROWSER,id);}return id;}
  function browserName(){const ua=navigator.userAgent;const os=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iOS':/Windows/i.test(ua)?'Windows':/Mac/i.test(ua)?'macOS':'设备';const browser=/Edg\//.test(ua)?'Edge':/Firefox|FxiOS/.test(ua)?'Firefox':/Chrome|CriOS/.test(ua)?'Chrome':/Safari/.test(ua)?'Safari':'浏览器';return os+' · '+browser;}
  const money=cents=>Number.isSafeInteger(cents)?new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(cents/100):'—';
  const time=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'时间未知':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);};
  function announce(id,message,error=false){const node=$(id);if(node){node.textContent=message;node.classList.toggle('is-error',error);}}
  function token(){return auth?.token||'';}
  function clearLocal(){auth=null;authEpoch++;finance=null;write(localStorage,KEY,null);write(sessionStorage,KEY,null);for(const storage of [localStorage,sessionStorage])for(const key of ['kust-lab-admin-secret','kust-lab-remembered-admin-secret']){try{storage.removeItem(key);}catch{}}
    if($('financeContent'))$('financeContent').innerHTML='';if($('sessionList'))$('sessionList').innerHTML='';
    if($('financeImport'))$('financeImport').value='';
  }
  function lock(message){clearLocal();document.querySelectorAll('dialog[open]').forEach(d=>d.close());bridge.lock?.();$('loginPassword').value='';$('loginPassword').placeholder='请输入管理员密码';$('rememberLogin').checked=false;announce('loginStatus',message||'请重新登录');}
  async function request(path,{method='GET',body,anonymous=false}={}) {
    const epoch=authEpoch,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(bridge.endpoint+path,{method,cache:'no-store',credentials:'omit',signal:controller.signal,headers:{...(body?{'Content-Type':'application/json'}:{}),...(!anonymous&&token()?{Authorization:'Bearer '+token()}:{})},...(body?{body:JSON.stringify(body)}:{})});
      const payload=await response.json().catch(()=>null);
      if(!anonymous&&epoch!==authEpoch)throw new Error('登录状态已变化');
      if(response.status===401&&!anonymous){lock('此浏览器的登录已失效，请重新输入密码。');throw new Error('登录已失效');}
      if(!response.ok||!payload?.ok)throw new Error(payload?.error?.message||'服务暂时不可用');
      return payload.data;
    }catch(error){if(error.name==='AbortError')throw new Error('连接超时，请检查网络后重试');throw error;}finally{clearTimeout(timer);}
  }
  async function login(password,remember){
    const data=await request('/api/auth/login',{method:'POST',anonymous:true,body:{password,browserId:browserId(),name:browserName(),remember}});
    if(!data||!/^ys_[a-f0-9]{64}$/.test(data.token)||!data.id)throw new Error('登录服务响应不完整');
    clearLocal();auth={...data,remember:Boolean(remember)};authEpoch++;
    write(sessionStorage,KEY,auth);if(remember&&!write(localStorage,KEY,auth))announce('loginStatus','浏览器未允许保存登录，下次需重新输入密码。');
    return true;
  }
  async function validateSession(){if(!token())return false;await request('/api/session');return true;}
  function setupLogin(){
    auth=read(sessionStorage,KEY)||read(localStorage,KEY);
    if(!auth||!/^ys_[a-f0-9]{64}$/.test(auth.token||''))auth=null;
    // Old credentials may prefill this one upgrade login, but are never used to bypass revocation.
    let legacy='';if(!auth){try{legacy=localStorage.getItem('kust-lab-remembered-admin-secret')||'';}catch{}}
    $('loginPassword').value=legacy;$('rememberLogin').checked=Boolean(auth?.remember||legacy);
    if(auth)$('loginPassword').placeholder='已记住登录，点击进入';
    $('toggleLoginPassword').addEventListener('click',function(){const showing=$('loginPassword').type==='text';$('loginPassword').type=showing?'password':'text';this.textContent=showing?'显示':'隐藏';this.setAttribute('aria-label',showing?'显示密码':'隐藏密码');});
    $('loginForm').addEventListener('submit',async event=>{
      event.preventDefault();if(busy)return;
      const password=bridge.normalize($('loginPassword').value),account=$('loginAccount').value.trim().toUpperCase();
      if(account!=='KANESHIRO'){announce('loginStatus','账号不正确，请使用 KANESHIRO。',true);return;}
      if(!password&&!auth){announce('loginStatus','请输入管理员密码。',true);return;}
      if(password&&!/^\d+$/.test(password)){announce('loginStatus','密码只能由数字构成。',true);return;}
      busy=true;$('loginSubmit').disabled=true;$('loginSubmit').textContent='正在验证…';announce('loginStatus','正在连接云端');
      try{
        if(password)await login(password,$('rememberLogin').checked);else {
          await validateSession();
          auth.remember=$('rememberLogin').checked;write(localStorage,KEY,auth.remember?auth:null);write(sessionStorage,KEY,auth);
        }
        $('loginPassword').value='';await bridge.loggedIn();show(active);
      }catch(error){announce('loginStatus',error.message,true);}finally{busy=false;$('loginSubmit').disabled=false;$('loginSubmit').textContent='进入玉衡山科学院';}
    });
  }
  async function logout(){if(bridge.dirty?.()&&!confirm('还有未上传的课表修改。退出后需重新登录才能继续，确定退出吗？'))return;
    try{if(token())await request('/api/sessions',{method:'POST',body:{action:'revoke',id:auth.id}});lock('已退出登录。');}catch(error){announce('settingsStatus','退出未完成：'+error.message,true);}
  }
  function show(module,push=true){
    if(!['schedule','finance','settings'].includes(module))module='schedule';
    if(module!==active)scrolls[active]=window.scrollY;
    const changed=module!==active;active=module;
    document.body.dataset.module=module;
    $('mainContent').hidden=module!=='schedule';$('financePage').hidden=module!=='finance';$('settingsPage').hidden=module!=='settings';
    document.querySelectorAll('[data-module-target]').forEach(b=>{b.classList.toggle('is-active',b.dataset.moduleTarget===module);b.setAttribute('aria-current',b.dataset.moduleTarget===module?'page':'false');});
    if(push&&changed)history.pushState({...(history.state||{}),instituteModule:module},'');
    if(changed){window.scrollTo({top:scrolls[module],behavior:'instant'});$('suiteModuleTitle').textContent={schedule:'课表',finance:'资金规划',settings:'设置'}[module];}
    if(module==='finance'&&token())loadFinance();if(module==='settings'&&token())loadSessions();
  }
  let financeBusy=false;
  async function loadFinance(){if(financeBusy)return;financeBusy=true;$('financeRefresh').disabled=true;announce('financeStatus','正在读取预算…');
    try{const latest=await request('/api/finance');if(finance&&(!latest||latest.revision<finance.revision))return;const changed=latest?.revision!==finance?.revision;finance=latest;if(changed||!$('financeContent').children.length)renderFinance();announce('financeStatus',finance?'修改同步时间：'+time(finance.updatedAt):'尚未导入预算，请在设置中导入经核对的预算快照。');}
    catch(error){announce('financeStatus',error.message+(finance?' · 以下保留上次读取的预算。':''),true);}finally{financeBusy=false;$('financeRefresh').disabled=false;}
  }
  function renderFinance(){const host=$('financeContent');if(!finance){host.innerHTML='<div class="suite-empty"><h2>预算待接入</h2><p>接入核对后的资金计划后，可在这里查看月度预算与还款安排。</p></div>';return;}
    const d=finance.document,old=$('financeMonth')?.value;const nowMonth=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit'}).format(new Date());
    const selected=d.months.some(m=>m.month===old)?old:d.months.some(m=>m.month===nowMonth)?nowMonth:d.months[0]?.month;
    const lowest=d.months.reduce((a,b)=>!a||b.balanceCents<a.balanceCents?b:a,null);
    host.innerHTML='<div class="finance-kpis"><article><span>已核对可用余额</span><strong>'+money(d.opening.availableCents)+'</strong><small>截至 '+escape(d.opening.asOf)+' · 非实时余额</small></article><article><span>锁定资金</span><strong>'+money(d.opening.lockedCents)+'</strong><small>单列，不重复计入可用余额</small></article><article class="'+(lowest?.balanceCents<0?'is-negative':'')+'"><span>预测最低月末余额</span><strong>'+money(lowest?.balanceCents)+'</strong><small>'+escape(lowest?.month||'暂无月份')+' · 按现有预算</small></article></div>'+
      '<section class="suite-card"><div class="suite-card-head"><div><p class="suite-eyebrow">MONTHLY PLAN</p><h2>月度计划</h2></div><label class="suite-month">月份<select id="financeMonth">'+d.months.map(m=>'<option value="'+escape(m.month)+'"'+(selected===m.month?' selected':'')+'>'+escape(m.month)+'</option>').join('')+'</select></label></div><div id="financeMonthDetail"></div></section>'+
      '<section class="suite-card"><h2>月末余额预测</h2><div class="finance-trend">'+d.months.map(m=>'<div class="finance-trend-row"><span>'+escape(m.month)+'</span><span class="finance-trend-track"><i style="width:'+Math.max(2,Math.min(100,Math.abs(m.balanceCents)/Math.max(1,...d.months.map(x=>Math.abs(x.balanceCents)))*100))+'%" class="'+(m.balanceCents<0?'is-negative':'')+'"></i></span><strong class="'+(m.balanceCents<0?'is-negative':'')+'">'+money(m.balanceCents)+'</strong></div>').join('')+'</div></section>'+
      '<details class="suite-card finance-rules"><summary>数据来源与计算口径</summary><p>来源：'+escape(d.source.version)+' · '+escape(d.source.file)+'</p><p>Excel 为主账本。网页为预算看板，修改工作簿后需重新导入快照。</p><ul>'+d.rules.map(r=>'<li>'+escape(r)+'</li>').join('')+'</ul></details>';
    host.querySelector('.finance-kpis article:nth-child(2) > span').textContent='基准日锁定资金';
    host.querySelector('.finance-kpis article:nth-child(2) > small').textContent='截至 '+d.opening.asOf+' · 单列，不重复计入可用余额';
    $('financeMonth').addEventListener('change',renderFinanceMonth);renderFinanceMonth();
  }
  function renderFinanceMonth(){if(!finance)return;const key=$('financeMonth').value,d=finance.document,m=d.months.find(x=>x.month===key);if(!m)return;
    const items=d.items.filter(x=>x.month===key);
    $('financeMonthDetail').innerHTML='<div class="finance-month-totals"><span>计划收入<b>'+money(m.incomeCents)+'</b></span><span>计划支出<b>'+money(m.expenseCents)+'</b></span><span>预计月末<b class="'+(m.balanceCents<0?'is-negative':'')+'">'+money(m.balanceCents)+'</b></span></div><p class="suite-note">'+escape(m.notes)+'</p><div class="finance-ledger">'+items.map(i=>'<article><div><span class="finance-kind '+i.direction+'">'+(i.direction==='income'?'收':'支')+'</span><strong>'+escape(i.name)+'</strong><small>'+escape(i.category)+(i.notes?' · '+escape(i.notes):'')+'</small></div><b>'+(i.direction==='income'?'+':'−')+money(i.amountCents)+'</b></article>').join('')+'</div>';
  }
  let sessionsBusy=false;
  async function loadSessions(){if(sessionsBusy)return;sessionsBusy=true;$('sessionsRefresh').disabled=true;announce('settingsStatus','正在核对登录记录…');
    try{const sessions=await request('/api/sessions');$('sessionList').innerHTML=sessions.map(s=>'<article class="session-row"><div><strong>'+escape(s.name)+(s.current?' <em>当前浏览器</em>':'')+'</strong><small>最近活动 '+time(s.lastSeen)+'</small><small>首次登录 '+time(s.createdAt)+'</small></div><div class="session-actions"><button type="button" data-session-rename="'+escape(s.id)+'" data-session-name="'+escape(s.name)+'">备注</button><button type="button" class="danger-text" data-session-revoke="'+escape(s.id)+'" data-current="'+s.current+'">退出</button></div></article>').join('');announce('settingsStatus','共 '+sessions.length+' 个有效登录 · 刚刚核对');}
    catch(error){announce('settingsStatus',error.message,true);}finally{sessionsBusy=false;$('sessionsRefresh').disabled=false;}
  }
  function download(name,value){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function init(api){bridge=api;
    $('suiteVersion').textContent=api.version;
    // Reuse existing course tools within the course module, not a competing app-level dock.
    const dock=document.querySelector('.mobile-dock');dock.classList.add('suite-course-tools');$('weekSection').prepend(dock);
    document.querySelectorAll('[data-module-target]').forEach(b=>b.addEventListener('click',event=>{event.preventDefault();show(b.dataset.moduleTarget);}));
    document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#"]');if(link&&['#mainContent','#todaySection','#weekSection'].includes(link.getAttribute('href'))&&active!=='schedule')show('schedule');});
    window.addEventListener('popstate',()=>show(history.state?.instituteModule||'schedule',false));
    $('financeRefresh').addEventListener('click',loadFinance);$('sessionsRefresh').addEventListener('click',loadSessions);
    $('settingsLogout').addEventListener('click',logout);
    $('settingsCourseBackup').addEventListener('click',()=>{show('schedule');$('accountImportExport').click();});
    $('settingsTrash').addEventListener('click',()=>{show('schedule');$('accountTrash').click();});
    $('sessionList').addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button||button.disabled)return;
      const id=button.dataset.sessionRename||button.dataset.sessionRevoke;
      let body;
      if(button.dataset.sessionRename){const name=prompt('为这个浏览器设置备注（如：手机 · 常用浏览器）',button.dataset.sessionName);if(!name?.trim())return;body={action:'rename',id,name:name.trim()};}
      else{if(!confirm(button.dataset.current==='true'?'退出当前浏览器？未上传的课表修改将保留在当前页面，重新登录后可继续。':'退出这个浏览器的登录？对方下次联网验证时需重新输入密码。'))return;body={action:'revoke',id};}
      button.disabled=true;
      try{await request('/api/sessions',{method:'POST',body});if(body.action==='revoke'&&button.dataset.current==='true')lock('当前浏览器已退出。');else await loadSessions();}catch(error){announce('settingsStatus',error.message,true);}finally{button.disabled=false;}
    });
    $('financeExport').addEventListener('click',async()=>{try{const latest=await request('/api/finance');if(!latest)throw new Error('暂无预算可导出');download('资金规划-'+latest.document.source.version+'.json',latest.document);announce('financeTransferStatus','已导出。文件含私人账目，请妥善保管。');}catch(error){announce('financeTransferStatus',error.message,true);}});
    $('financeImport').addEventListener('change',async function(){const file=this.files[0];if(!file)return;this.disabled=true;try{
      if(file.size>512000)throw new Error('预算快照不能超过500KB');const doc=JSON.parse(await file.text());
      if(!doc.source?.version||doc.schemaVersion!==1)throw new Error('请选择经核对的预算快照 JSON 文件');
      const current=await request('/api/finance');
      if(!confirm('导入预算版本 '+doc.source.version+'？这会替换网页预算快照，不会修改本地Excel。'))return;
      finance=await request('/api/finance',{method:'PUT',body:{baseRevision:current?.revision||0,document:doc}});announce('financeTransferStatus','已导入 '+finance.document.source.version+' · '+time(finance.updatedAt));renderFinance();
    }catch(error){announce('financeTransferStatus',error.message,true);}finally{this.disabled=false;this.value='';}});
    const prefs=read(localStorage,PREFS)||{};$('reduceMotion').checked=Boolean(prefs.reduceMotion);document.body.classList.toggle('suite-reduced-motion',Boolean(prefs.reduceMotion));
    $('reduceMotion').addEventListener('change',function(){document.body.classList.toggle('suite-reduced-motion',this.checked);write(localStorage,PREFS,{reduceMotion:this.checked});});
    async function check(){if(document.hidden||document.body.classList.contains('app-locked')||!token())return;try{await validateSession();if(active==='finance')await loadFinance();}catch(error){if(token())announce('settingsStatus','暂时无法核对登录状态：'+error.message,true);}}
    setInterval(check,60000);window.addEventListener('online',check);document.addEventListener('visibilitychange',check);
    window.addEventListener('storage',event=>{if(event.key===KEY&&auth?.remember){const next=read(localStorage,KEY);if(!next||next.token!==auth.token)lock('登录信息已在其他标签页变更，请重新登录。');}});
  }
  window.Institute={init,setupLogin,login,token,clearLocal,logout,show,loadFinance,loadSessions,validateSession,browserName};
})();
