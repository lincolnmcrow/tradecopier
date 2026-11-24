function apiBase(mode) {
  if (!['live', 'demo'].includes(mode)) throw Error('Choose a Tradovate environment.')
  return 'https://' + mode + '.tradovateapi.com/v1/'
}

export async function signIn(mode, { name, password, cid, sec }, deviceId) {
  if (!name.trim() || !password || !sec.trim() || !/^\d+$/.test(cid.trim()) || !Number.isSafeInteger(Number(cid)) || Number(cid) <= 0)
    throw Error('Enter your username, password, numeric client ID and API key.')
  const response = await fetch(apiBase(mode) + 'auth/accesstokenrequest', {
    method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name: name.trim(), password, cid: Number(cid), sec: sec.trim(), appId: 'Relay', appVersion: '1.0', deviceId })
  })
  const data = await response.json()
  if (data['p-ticket'] || response.status === 429) throw Error('Tradovate limited sign-in attempts. Wait before trying again.')
  if (!response.ok || typeof data.accessToken !== 'string' || !data.accessToken)
    throw Error('Tradovate declined sign-in. Check your credentials, environment and any device approval from Tradovate.')
  return data.accessToken
}

export function tradovate(mode, token) {
  const base = apiBase(mode)
  async function call(path, body) {
    const r = await fetch(base + path, {method:body ? 'POST':'GET', cache:'no-store', signal:AbortSignal.timeout(9000),
      headers:{Authorization:'Bearer '+token, 'Content-Type':'application/json'}, body:JSON.stringify(body)})
    const data = await r.json()
    if (!r.ok || data.errorText || data['p-ticket']) throw Error('Tradovate request failed ('+r.status+'). Check orders and reconnect if needed.')
    return data
  }
  return { accounts:()=>call('account/list'), fills:()=>call('fill/list'), order:id=>call('order/item?id='+encodeURIComponent(id)),
    symbol:async id=>(await call('contract/item?id='+encodeURIComponent(id))).name, place:body=>call('order/placeorder',body) }
}
export function practice() {
  const rows = [], orders = new Map()
  const accounts = ['Practice A','Practice B','Practice C'].map((name,i)=>({id:i+1,name}))
  function add(accountId,action,qty) {
    const id = rows.length + 1
    orders.set(id,{accountId})
    rows.push({id,orderId:id,action,qty,contractId:1,timestamp:new Date().toISOString(),active:true})
    return {orderId:id}
  }
  return { accounts:async()=>accounts, fills:async()=>[...rows], order:async id=>orders.get(id),
    symbol:async()=>'MNQ', place:async o=>add(o.accountId,o.action,o.orderQty), add }
}
