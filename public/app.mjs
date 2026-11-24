import {linkedTradovate} from './linked.mjs'
import {copySession} from './engine.mjs'
import {practice, signIn, tradovate} from './broker.mjs'
import {connectProjectX,gateway} from './projectx.mjs'
import {draw} from './chart.mjs'
import {limitTicket, submitTicket} from './ticket.mjs'

const $=id=>document.getElementById(id)
const sim=practice(), connections=new Map()
let accounts=[], active=false, copying=false, busy=false, sending=false, chartVersion=0, statVersion=0, bars=[], accepted=0
const leader=()=>accounts.find(a=>a.key===$('leader').value)
const checked=()=>accounts.filter(a=>[...$('followers').querySelectorAll(':checked')].some(box=>box.value===a.key))
function routeNote(){
  $('routeNote').textContent=$('route').value==='group'?'Each selected account receives its own limit entry and attached exits. Fill copying stays off.':'Brackets rest on the leader. Followers copy entry and exit fills while the copier runs.'
}
$('route').onchange=routeNote
const symbol=()=>$('symbol').value.trim().toUpperCase()
const practiceMode=()=>!connections.size
const message=text=>{$('message').textContent=text}
function log(text) {
  $('empty').hidden=true
  const item=document.createElement('li'), time=document.createElement('time')
  time.textContent=new Date().toLocaleTimeString(); item.append(time,text); $('events').prepend(item)
  if ($('events').children.length>200) $('events').lastChild.remove()
}
function controls() {
  $('settings').disabled=$('loginFields').disabled=$('disconnect').disabled=busy||copying||sending
  $('ticketFields').disabled=busy||sending||!leader()||(copying&&(!active||$('status').textContent!=='Copying'))
  $('route').disabled=copying
  if(copying)$('route').value='leader'
  routeNote()
  $('start').hidden=copying; $('start').disabled=busy||sending||accounts.length<2
  $('stop').hidden=!copying; $('stop').disabled=!active
  $('buy').disabled=$('sell').disabled=!active || $('status').textContent!=='Copying'
  $('practice').hidden=!practiceMode()
  $('disconnect').hidden=practiceMode()
}
function formMode() {
  const mode=$('mode').value
  for (const [group,visible] of [['auth',mode!=='practice'],['loginName',['demo','live','px'].includes(mode)],['tv',['demo','live'].includes(mode)],['px',mode==='px']])
    for (const label of document.querySelectorAll('.'+group)) {label.hidden=!visible;label.firstElementChild.disabled=!visible}
  $('ctHelp').hidden=mode!=='ct'
  $('signIn').hidden=mode==='practice'
}
function clearChart(text) {
  chartVersion++;bars=[];
  $('tvChart').hidden=true;$('tvChart').removeAttribute('src');$('chart').hidden=false;
  $('tvSearch').hidden=$('source').value!=='tradingview';draw($('chart'),bars);$('chartInfo').textContent=text;$('ohlc').textContent=''
}
async function chart() {
  const a=accounts.find(x=>x.key===$('source').value), name=symbol(), mins=Number($('minutes').value)
  clearChart('Loading chart…')
  const version=chartVersion
  if($('source').value==='tradingview'){
    const name=$('tvSymbol').value.trim().toUpperCase()
    if(!name)return clearChart('Enter a TradingView symbol.')
    $('chart').hidden=true;$('tvChart').hidden=false
    $('tvChart').src='/market.html#'+new URLSearchParams({symbol:name,minutes:mins})
    $('chartInfo').textContent='TradingView · '+name+' · exchange data may be delayed. Orders use the separate order contract.'
    return
  }
  try {
    if (!a||!name) throw Error('Connect a chart-capable feed and enter an exact contract.')
    const rows=await a.broker.bars(name,mins)
    if (version!==chartVersion) return
    const last=draw($('chart'),rows)
    if (!last) throw Error('No bars returned for this symbol and interval.')
    bars=rows
    $('chartInfo').textContent=(practiceMode()?'Synthetic practice prices':a.label+' · broker history')+' · '+name+' · '+mins+' min'
    $('ohlc').textContent='O '+last.open+'   H '+last.high+'   L '+last.low+'   C '+last.close+'   ·   '+new Date(last.timestamp).toLocaleString()
  } catch(e) {if (version===chartVersion) clearChart(e.message)}
}
async function stats() {
  const a=leader(), version=++statVersion
  for (const id of ['balance','realized','open','positions']) $(id).textContent='—'
  $('statInfo').textContent='Loading account snapshot…'
  try {
    const data=await a.broker.stats(a.id)
    if (version!==statVersion) return
    for (const id of ['balance','realized','open','positions']) if (Number.isFinite(data[id])) $(id).textContent=data[id].toLocaleString(undefined,{maximumFractionDigits:2})
    $('statInfo').textContent=a.label+' · '+a.name+' · '+new Date().toLocaleTimeString()+' · — unavailable'
  } catch(e) {if(version===statVersion) $('statInfo').textContent='Account snapshot unavailable. '+e.message}
}
function leaderChanged() {
  const a=leader()
  $('followers').replaceChildren()
  for(const acct of accounts.filter(x=>x.key!==a.key)) {
    const label=document.createElement('label'),box=document.createElement('input')
    box.type='checkbox';box.value=acct.key;label.className='check';label.append(box,acct.label+' / '+acct.name);$('followers').append(label)
  }
  $('ticketAccount').textContent=a.label+' / '+a.name
  for(const id of ['entry','sl','tp']) $(id).value=''
  ratio();stats()
  const sources=accounts.filter((x,i)=>x.broker.bars && accounts.findIndex(other=>other.broker===x.broker)===i)
  $('source').replaceChildren(...sources.map(x=>new Option(x.label,x.key)),new Option('TradingView chart','tradingview'))
  const preferred=sources.find(x=>x.broker===a.broker)
  if(preferred) $('source').value=preferred.key
  if(practiceMode()||!sources.length) chart()
  else clearChart(sources.length?'Load broker history for an exact contract.':'Chart history needs a ProjectX or entitled Tradovate data connection.')
}
async function rebuild() {
  const old=$('leader').value
  if(practiceMode()) accounts=(await sim.accounts()).map(a=>({...a,key:'practice:'+a.id,label:'Practice',broker:sim}))
  else accounts=[...connections.values()].flatMap(c=>c.accounts)
  $('leader').replaceChildren(...accounts.map(a=>new Option(a.label+' / '+a.name,a.key)))
  if(accounts.some(a=>a.key===old)) $('leader').value=old
  $('deskInfo').textContent=practiceMode()?'Practice workspace · simulated data':connections.size+' connections · '+accounts.length+' accessible accounts'
  $('connectionsList').textContent=practiceMode()?'Practice accounts':Array.from(connections.values(),c=>c.label+' ('+c.accounts.length+')').join(' · ')
  leaderChanged();controls()
}
function deviceId() {
  let id=localStorage.getItem('relay-device')
  if(!id){id=crypto.randomUUID();localStorage.setItem('relay-device',id)}
  return id
}
$('credentials').onsubmit=async e=>{
  e.preventDefault()
  if(busy||copying||sending||$('mode').value==='practice') return
  busy=true;controls();message('Connecting…')
  const mode=$('mode').value, name=$('username').value.trim(), sec=$('secret').value.trim()
  try {
    if((!name&&mode!=='ct')||!sec) throw Error('Enter your platform username and API key.')
    const domain=mode==='ct'?'tradovate-demo':mode==='px'?gateway($('gateway').value):'tradovate-'+mode
    const broker=mode==='ct'?linkedTradovate(sec):mode==='px'?await connectProjectX(domain,name,sec,$('dataLive').value==='true'):
      tradovate(mode,await signIn(mode,{name,sec,password:$('password').value,cid:$('cid').value},deviceId()))
    const label=($('firm').value.trim()||name||'Prop accounts')+' · '+(mode==='px'?'ProjectX':mode==='ct'?'CrossTrade':mode)
    const available=(await broker.accounts()).filter(a=>Number.isSafeInteger(a.id)&&a.active!==false)
    if(!available.length) throw Error('This login returned no tradable accounts.')
    const mapped=available.map(a=>({...a,key:domain+':'+a.id,label,broker}))
    if(mapped.some(a=>accounts.some(old=>old.key===a.key))) throw Error('An account from this connection is already on the desk.')
    connections.set(crypto.randomUUID(),{label,accounts:mapped})
    if(accounts[0]?.broker===sim) {$('symbol').value='';resetActivity()}
    $('username').value=$('firm').value=$('cid').value=''
    await rebuild();message('Connection added. Add another login here to route across accounts.')
  } catch(e){message(e.message)}
  finally {$('password').value=$('secret').value='';busy=false;controls()}
}
function resetActivity(){accepted=0;$('copies').textContent='0';$('events').replaceChildren();$('empty').hidden=false}
$('disconnect').onclick=async()=>{connections.clear();resetActivity();$('mode').value='practice';$('credentials').reset();$('symbol').value='MNQ';formMode();await rebuild();message('Disconnected.')}
$('mode').onchange=formMode
$('leader').onchange=leaderChanged
$('chartLoad').onclick=chart
$('minutes').onchange=chart
$('source').onchange=chart
$('tvSymbol').oninput=()=>clearChart('Load the selected TradingView symbol.')
$('symbol').oninput=()=>{clearChart('Load chart for this contract.');for(const id of ['entry','sl','tp']) $(id).value='';ratio()}
$('refreshStats').onclick=stats
new ResizeObserver(()=>{if(bars.length) draw($('chart'),bars)}).observe($('chart'))
function stop(reason){if(active){active=false;$('status').textContent='Stopping';log(reason);controls()}}
$('stop').onclick=()=>stop('Copier stopped by user.')
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('Tab hidden. Reconcile positions before restarting.')})
window.addEventListener('pagehide',()=>stop('Session closed'))
$('start').onclick=async()=>{
  if(copying||busy||sending) return
  const a=leader(), ids=new Set([...$('followers').querySelectorAll(':checked')].map(x=>x.value)),followers=accounts.filter(x=>ids.has(x.key))
  if(!followers.length)return message('Select at least one follower account.')
  if(!practiceMode()&&!confirm('Copy new fills from '+a.label+' / '+a.name+' to '+followers.map(x=>x.label+' / '+x.name).join(', ')+'? Broker orders may affect funded accounts.'))return
  active=copying=true;message('');$('status').textContent='Starting';controls()
  try {
    await navigator.locks.request('relay-copier',{ifAvailable:true},async lock=>{
      if(!lock)throw Error('Another tab is already running a copier.')
      for(const acct of [a,...followers]) {
        const key='relay-group:'+acct.key
        if(!localStorage.getItem(key)) continue
        if(!await acct.broker.idle(acct.id)) throw Error('Group orders or positions remain on '+acct.name+'. Finish the group trade before starting fill copying.')
        localStorage.removeItem(key)
      }
      await copySession({broker:{...a.broker,key:a.key},leader:a.id,followers,cap:Number($('cap').value),running:()=>active,
        wait:()=>new Promise(resolve=>setTimeout(resolve,practiceMode()?350:3000)),onAccepted:()=>{$('copies').textContent=String(++accepted)},
        log:text=>{if(text==='Watching new fills'){$('status').textContent='Copying';controls()}log(text)}})
    })
  }catch(e){message(e.message);log(e.message)}
  finally{active=copying=false;$('status').textContent='Copier idle';controls()}
}
for(const action of ['Buy','Sell']) $(action.toLowerCase()).onclick=()=>sim.add(leader().id,action,1,symbol()||'MNQ')
const optional=id=>$(id).value===''?null:$(id).valueAsNumber
function ticket(){return limitTicket({symbol:symbol(),action:$('side').value,qty:$('qty').valueAsNumber,entry:$('entry').valueAsNumber,stop:optional('sl'),target:optional('tp')},leader())}
function ratio(){
  try{ticket();const stop=optional('sl'),target=optional('tp'),entry=optional('entry');$('ratio').textContent=stop!==null&&target!==null?'Reward / risk   '+Math.abs((target-entry)/(entry-stop)).toFixed(2)+' : 1':'Add both exits to see reward/risk.'}
  catch(e){$('ratio').textContent=$('entry').value?e.message:'Enter a limit price to preview the order.'}
}
$('ticket').oninput=ratio
$('ticket').onsubmit=async e=>{
  e.preventDefault()
  if(sending||busy||(copying&&(!active||$('status').textContent!=='Copying')))return
  const a=leader()
  try {
    const o=ticket()
    if(copying && o.orderQty>Number($('cap').value)) throw Error('Order quantity exceeds the active copier limit.')
    const group=$('route').value==='group', targets=group?[a,...checked()]:[a]
    if(group && (copying||targets.length<2))throw Error('Stop fill copying and select at least one follower for a group ticket.')
    if(group && (!o.bracket1||!o.bracket2))throw Error('Enter both stop loss and take profit for the group bracket.')
    if(group && (!Number.isSafeInteger(Number($('cap').value)) || o.orderQty>Number($('cap').value)))throw Error('Group quantity exceeds the configured per-order limit.')
    const summary=targets.map(t=>t.label+' / '+t.name).join('\n')
    if(!confirm(summary+'\n'+o.action+' '+o.orderQty+' '+o.symbol+' limit '+o.price+' PER ACCOUNT\nStop: '+($('sl').value||'None')+' · Target: '+($('tp').value||'None')+'\nSubmit to '+targets.length+' account(s)?'))return
    sending=true;controls()
    const submit=()=>submitTicket(o,targets,{group,log,mark:key=>localStorage.setItem('relay-group:'+key,'1')})
    if(group)await navigator.locks.request('relay-copier',{ifAvailable:true},async lock=>{
      if(!lock)throw Error('A copier is active in another tab.')
      await submit()
    })
    else await submit()
    message('Accepted. Monitor entries and exits, or cancel working orders, in the broker platform.')
  }catch(err){log(err.message);message(err.message)}
  finally{sending=false;controls()}
}
formMode();await rebuild()
