'use strict';
const CONFIG = [
  {cap:'256', capacity:'256GB',color:'white',colorName:'星光白色',part:'MK2D4ZP/A'},
  {cap:'256', capacity:'256GB',color:'black',colorName:'夜空色',part:'MK2E4ZP/A'},
  {cap:'512', capacity:'512GB',color:'white',colorName:'星光白色',part:'MK2F4ZP/A'},
  {cap:'512', capacity:'512GB',color:'black',colorName:'夜空色',part:'MK2G4ZP/A'},
  {cap:'1tb', capacity:'1TB',color:'white',colorName:'星光白色',part:'MK2H4ZP/A'},
  {cap:'1tb', capacity:'1TB',color:'black',colorName:'夜空色',part:'MK2J4ZP/A'},
  {cap:'2tb', capacity:'2TB',color:'white',colorName:'星光白色',part:'MK2K4ZP/A'},
  {cap:'2tb', capacity:'2TB',color:'black',colorName:'夜空色',part:'MK2L4ZP/A'}
];
const STORE_IDS = ['taipei101','xinyia13'];
const el = s=>document.querySelector(s);
let activeCap='all', activeColor='all', lastResult=null, queryError=null;
let requestInProgress=false, nextDue=0, loop=null, firstSuccess=false, previousAvailability=null;
const localKey='iphone-duo-radar-v1';
const BUY_URL='https://www.apple.com/tw/shop/buy-iphone/iphone-duo';
const statusNames = {available:'可取貨',unavailable:'暫無庫存',unknown:'無法確認',awaiting:'尚未開放查詢',pending:'尚未查詢'};

function restore(){try{const s=JSON.parse(localStorage.getItem(localKey)||'{}');activeCap=s.cap||'all';activeColor=s.color||'all';el('#autoRefresh').checked=s.auto!==false;el('#interval').value=['60','120','180','300'].includes(String(s.interval))?String(s.interval):'120';el('#notify').checked=!!s.notify;}catch{}}
function persist(){try{localStorage.setItem(localKey,JSON.stringify({cap:activeCap,color:activeColor,auto:el('#autoRefresh').checked,interval:el('#interval').value,notify:el('#notify').checked}));}catch{}}
function showToast(t){const div=el('#toast');div.textContent=t;div.classList.add('visible');clearTimeout(showToast.id);showToast.id=setTimeout(()=>div.classList.remove('visible'),3700)}
function setNotice(text, type=''){const n=el('#notice');n.className='notice '+type;el('#noticeText').textContent=text;}
function setTop(state,label){el('#statusDot').className='statusdot '+state;el('#statusLabel').textContent=label;}
function selection(){return CONFIG.filter(v=>(activeCap==='all'||v.cap===activeCap)&&(activeColor==='all'||v.color===activeColor));}
function timeString(date){return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date)}
function prettyDate(date){return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(date)}
function create(name,className,text){const e=document.createElement(name);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function inventoryAt(id,part){return lastResult?.stores?.find(x=>x.id===id)?.inventory?.[part]||{status: lastResult?'unknown':'pending'};}
function render(){
  for(const store of STORE_IDS){
    const box=document.querySelector(`[data-store="${store}"]`);box.textContent='';
    let has=0,missing=0,awaiting=0;
    for(const v of selection()){
      const info=inventoryAt(store,v.part),state=info.status||'unknown';
      if(state==='available')has++;else if(state==='unavailable')missing++;else if(state==='awaiting')awaiting++;
      const row=create('div','sku-row');row.append(create('div','phone-disc '+v.color));
      const details=create('div','sku-text');details.append(create('div','sku-name',`${v.capacity} · ${v.colorName}`),create('div','sku-part',v.part));row.append(details);
      const stateCell=create('div','sku-state');stateCell.append(create('span','pill '+state,statusNames[state]||statusNames.unknown));
      if(state==='available') {const a=create('a','sku-buy','立即前往 ↗');a.href=BUY_URL;a.target='_blank';a.rel='noopener noreferrer';stateCell.append(a);}
      if(info.quote && (state==='available'||state==='awaiting'))stateCell.append(create('div','availability-quote',info.quote));
      row.append(stateCell);box.append(row);
    }
    const tag=el(`#store-${store} .store-status`);
    if(!lastResult){tag.textContent=queryError?'查詢失敗':'尚未查詢';tag.className='store-status unknown';}
    else if(has){tag.textContent=`${has} 款可取`;tag.className='store-status available';}
    else if(missing===selection().length){tag.textContent='目前缺貨';tag.className='store-status unavailable';}
    else if(awaiting===selection().length){tag.textContent='尚未開放查詢';tag.className='store-status awaiting';}
    else{tag.textContent='部分未知';tag.className='store-status unknown';}
  }
  const n=selection().length;el('#watchCount').innerHTML=`${n*2} <span>組</span>`;
  const amount=lastResult? STORE_IDS.reduce((num,id)=> num+selection().filter(v=>inventoryAt(id,v.part).status==='available').length,0):null;
  const known=lastResult?STORE_IDS.some(id=>selection().some(v=>['available','unavailable'].includes(inventoryAt(id,v.part).status))):false;
  el('#availableCount').textContent=!known?'—':String(amount).padStart(2,'0');
  if(lastResult){el('#lastUpdate').textContent=`最後取得資料：${prettyDate(new Date(lastResult.checkedAt))}`;}
  for(const [g, key, value] of [['#capacities','cap',activeCap],['#colors','color',activeColor]]){
    document.querySelectorAll(`${g} button`).forEach(b=>{const on=b.dataset[key]===value;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
  }
  el('#autoLabel').textContent=el('#autoRefresh').checked?'已開啟':'已暫停';
  el('#notifyLabel').textContent=el('#notify').checked?'已開啟':'未開啟';
}
function beep(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)throw new Error();const ctx=new C();const make=(freq,t)=>{const osc=ctx.createOscillator(),vol=ctx.createGain();osc.type='sine';osc.frequency.value=freq;vol.gain.setValueAtTime(0.0001,t);vol.gain.exponentialRampToValueAtTime(.18,t+.015);vol.gain.exponentialRampToValueAtTime(.0001,t+.21);osc.connect(vol).connect(ctx.destination);osc.start(t);osc.stop(t+.22)};const t=ctx.currentTime;make(660,t);make(880,t+.26);setTimeout(()=>ctx.close().catch(()=>{}),1000);}catch{showToast('瀏覽器目前不允許播放提醒音');}}
async function enableNotification(){if(!el('#notify').checked)return;if(!('Notification'in window)){showToast('此瀏覽器不支援系統通知，仍可使用提醒音');return;}if(!window.isSecureContext){showToast('系統通知需要 HTTPS 或 localhost，提醒音仍可使用');return;}if(Notification.permission==='default'){try{await Notification.requestPermission();}catch{}}
  if(Notification.permission!=='granted')showToast('通知未獲允許，到貨時仍會播放提醒音');
}
function sendAlert(items){if(!el('#notify').checked)return;beep();const text=items.length===1?`${items[0].store} · ${items[0].product}`:`${items.length} 組 iPhone Duo 庫存可取，立即查看門市`;
  showToast('🎉 iPhone Duo 有貨！'+text);
  if('Notification'in window&&Notification.permission==='granted'&&window.isSecureContext){try{const n=new Notification('iPhone Duo 到貨提醒',{body:text,tag:'duo-pickup-alert'});n.onclick=()=>{window.focus();window.open(BUY_URL,'_blank','noopener,noreferrer')};}catch{}}
}
function collectAvailable(response){const s=new Set();for(const store of response.stores||[]){for(const v of CONFIG){if(store.inventory?.[v.part]?.status==='available')s.add(`${store.id}|${v.part}`);}}return s;}
function scanRestock(response){const current=collectAvailable(response);if(previousAvailability!==null){const fresh=[];for(const k of current){if(!previousAvailability.has(k)){const [id,part]=k.split('|'),v=CONFIG.find(x=>x.part===part);fresh.push({store:id==='taipei101'?'台北 101':'信義 A13',product:v?`${v.capacity} ${v.colorName}`:part});}}if(fresh.length)sendAlert(fresh);}else if(current.size){showToast(`本次查詢發現 ${current.size} 組可取貨，請立即查看！`);}previousAvailability=current;}
async function check(){
  if(requestInProgress)return;requestInProgress=true;el('#refreshButton').disabled=true;el('#refreshIcon').classList.add('spinning');setTop('','正在查詢 Apple…');
  try{const r=await fetch('/api/check',{cache:'no-store'});const data=await r.json();if(!r.ok||!data.ok)throw new Error(data.error||`查詢失敗 (${r.status})`);
    queryError=null;scanRestock(data);lastResult=data;firstSuccess=true;
    const all=collectAvailable(data).size;
    const statuses=data.stores.flatMap(s=>Object.values(s.inventory||{}).map(v=>v.status));
    const awaiting=statuses.filter(v=>v==='awaiting').length;
    const known=statuses.filter(v=>v==='available'||v==='unavailable').length;
    const upcomingQuote=data.stores.flatMap(s=>Object.values(s.inventory||{})).find(v=>v.status==='awaiting'&&v.quote)?.quote;
    if(all){
      setNotice(`官方回傳 ${all} 組可供門市取貨！請儘快前往 Apple 官網完成訂購，庫存可能隨時變動。`,'success');
      setTop('ok','官方查詢成功');
    }else if(awaiting && !known){
      setNotice(`Apple 目前尚未公布可供確認的門市取貨狀態。${upcomingQuote||'請待 Apple 官方開放查詢。'} 網站會照設定繼續更新；此狀態不代表缺貨。`,'');
      setTop('','等待 Apple 開放查詢');
    }else{
      setNotice('已取得 Apple 取貨資料。未公布的規格不代表缺貨；下單前請再次於 Apple 官網確認。','');
      setTop('ok','官方查詢成功');
    }
  }catch(e){queryError=e.message;lastResult=null;setNotice(`目前無法判斷庫存：${e.message}。請透過上方「Apple 官網」查詢，不能將此結果視為缺貨。`,'error');setTop('error','官方查詢失敗');}
  finally{requestInProgress=false;el('#refreshButton').disabled=false;el('#refreshIcon').classList.remove('spinning');nextDue=Date.now()+Number(el('#interval').value)*1000;render();updateCountdown();}
}
function updateCountdown(){if(!el('#autoRefresh').checked){el('#nextCheck').textContent='暫停';return;}if(requestInProgress){el('#nextCheck').textContent='查詢中';return;}const seconds=Math.max(0,Math.ceil((nextDue-Date.now())/1000));el('#nextCheck').textContent=nextDue?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'—';}
function bind(){
  el('#refreshButton').addEventListener('click',()=>check());
  document.querySelectorAll('#capacities button').forEach(b=>b.addEventListener('click',()=>{activeCap=b.dataset.cap;persist();render();}));
  document.querySelectorAll('#colors button').forEach(b=>b.addEventListener('click',()=>{activeColor=b.dataset.color;persist();render();}));
  el('#interval').addEventListener('change',()=>{persist();nextDue=Date.now()+Number(el('#interval').value)*1000;render();updateCountdown();});
  el('#autoRefresh').addEventListener('change',()=>{persist();nextDue=Date.now()+Number(el('#interval').value)*1000;render();updateCountdown();});
  el('#notify').addEventListener('change',()=>{persist();render();enableNotification();});
  el('#testSound').addEventListener('click',()=>{beep();showToast('這是到貨時會播放的提醒音');});
  loop=setInterval(()=>{updateCountdown();if(el('#autoRefresh').checked&&!requestInProgress&&nextDue&&Date.now()>=nextDue){check();}},1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&el('#autoRefresh').checked&&nextDue&&Date.now()>=nextDue&&!requestInProgress)check();});
}
restore();bind();render();check();
