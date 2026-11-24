import { copySession } from './engine.mjs'
import { practice, tradovate } from './broker.mjs'
const $ = id => document.getElementById(id)
let broker, accounts = [], token, active = false, busy = false
const mode = () => $('mode').value
function log(text) {
  $('empty').hidden = true
  const item = document.createElement('li'), time = document.createElement('time')
  time.textContent = new Date().toLocaleTimeString()
  item.append(time, text)
  $('events').prepend(item)
  if ($('events').children.length > 200) $('events').lastChild.remove()
}
function message(text) { $('message').textContent = text }
function controls() {
  $('mode').disabled = busy
  $('connect').disabled = busy
  $('settings').disabled = busy || !accounts.length
  $('start').disabled = busy || accounts.length < 2
  $('start').hidden = busy && active
  $('stop').hidden = !active
  $('buy').disabled = $('sell').disabled = !active || $('status').textContent !== 'Copying'
}
function followers() {
  $('followers').replaceChildren()
  for (const a of accounts.filter(a => a.id !== Number($('leader').value))) {
    const label = document.createElement('label'), box = document.createElement('input')
    box.type = 'checkbox'; box.value = a.id; label.className = 'check'
    label.append(box,a.name); $('followers').append(label)
  }
}
async function load() {
  busy = true; accounts = []; controls(); message('')
  $('connect').hidden = mode() === 'practice'
  $('connect').textContent = token ? 'Disconnect' : 'Connect Tradovate'
  $('practice').hidden = mode() !== 'practice'
  $('detail').textContent = mode() === 'practice' ? 'Local practice accounts' : 'Sign in with your own Tradovate account.'
  $('leader').replaceChildren(); followers()
  try {
    broker = mode() === 'practice' ? practice() : token && tradovate(mode(), token)
    if (broker) {
      accounts = (await broker.accounts()).filter(a => a.active !== false && Number.isSafeInteger(a.id))
      for (const a of accounts) $('leader').add(new Option(a.name,a.id))
      followers()
      if (mode() !== 'practice') $('detail').textContent = accounts.length+' accounts available'
      if (accounts.length < 2) message('This environment needs a leader and at least one other accessible account.')
    }
  } catch(e) { message(e.message) }
  finally { busy = false; controls() }
}
async function oauth(body) {
  const r = await fetch('/.netlify/functions/oauth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const data = await r.json()
  if (!r.ok) throw Error(data.error)
  return data
}
$('connect').onclick = async () => {
  if (token) { token = null; await load(); return }
  busy = true; controls()
  try {
    sessionStorage.setItem('relay-mode',mode())
    location.assign((await oauth({start:true})).url)
  } catch(e) {message(e.message); busy = false; controls()}
}
$('mode').onchange = async () => { token = null; await load() }
$('leader').onchange = followers
function stop(reason) {
  if (!active) return
  active = false; $('status').textContent = 'Stopping'; log(reason); controls()
}
$('stop').onclick = () => stop('Stopped by user. Already submitted orders may still fill.')
document.addEventListener('visibilitychange',()=>{if (document.hidden) stop('Tab hidden. Check positions before restarting.')})
window.addEventListener('pagehide',()=>stop('Session closed'))
$('start').onclick = async () => {
  const leader = Number($('leader').value)
  const ids = [...$('followers').querySelectorAll(':checked')].map(x=>Number(x.value))
  const selected = accounts.filter(a=>ids.includes(a.id))
  if (!selected.length) return message('Select at least one follower.')
  if (!$('cap').reportValidity() || !Number.isSafeInteger(Number($('cap').value)) || Number($('cap').value)<1) return message('Enter a positive order limit.')
  if (mode()==='live' && !window.confirm('Start real-money copying from '+$('leader').selectedOptions[0].text+' to '+selected.map(a=>a.name).join(', ')+'?')) return
  busy = active = true; message(''); $('status').textContent = 'Starting'; controls()
  try {
    await navigator.locks.request('relay-copier',{ifAvailable:true},async lock=>{
      if (!lock) throw Error('A copier is already running in another tab.')
      await copySession({broker,leader,followers:selected,cap:Number($('cap').value),running:()=>active,
        wait:()=>new Promise(resolve=>setTimeout(resolve,mode()==='practice'?350:3000)),
        log:text=>{if (text==='Watching new fills') {$('status').textContent='Copying'; controls()} log(text)}})
    })
  } catch(e) {message(e.message); log('Stopped · '+e.message)}
  finally {busy = active = false; $('status').textContent='Idle'; controls()}
}
for (const action of ['Buy','Sell']) $(action.toLowerCase()).onclick = ()=>broker.add(Number($('leader').value),action,1)
const params = new URLSearchParams(location.search)
let connectionError
if (params.has('code') || params.has('error')) {
  history.replaceState(null,'','/')
  $('mode').value = sessionStorage.getItem('relay-mode') === 'live' ? 'live':'demo'
  sessionStorage.removeItem('relay-mode')
  try {
    if (!params.has('code')) throw Error('Sign-in cancelled.')
    token = (await oauth({code:params.get('code'),state:params.get('state')})).token
  } catch(e) {connectionError = e.message}
}
await load()
if (connectionError) message(connectionError)
