import {tradovateBars} from './chart.mjs'
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
  return {accessToken:data.accessToken, mdAccessToken:data.mdAccessToken || data.accessToken}
}

export function tradovate(mode, session) {
  const base = apiBase(mode)
  async function call(path, body) {
    const r = await fetch(base + path, {method:body ? 'POST':'GET', cache:'no-store', signal:AbortSignal.timeout(9000),
      headers:{Authorization:'Bearer '+session.accessToken, 'Content-Type':'application/json'}, body:JSON.stringify(body)})
    const data = await r.json()
    if (!r.ok || data.errorText || data['p-ticket']) throw Error('Tradovate request failed ('+r.status+'). Check orders and reconnect if needed.')
    return data
  }
  return { accounts:()=>call('account/list'), fills:()=>call('fill/list'), order:id=>call('order/item?id='+encodeURIComponent(id)),
    symbol:async id=>(await call('contract/item?id='+encodeURIComponent(id))).name, lookup:symbol=>call('contract/find?name='+encodeURIComponent(symbol)),
    bars:(symbol,minutes)=>tradovateBars(session.mdAccessToken,symbol,minutes),
    async idle(id) {
      const [p,o]=await Promise.all([call('position/deps?masterid='+id),call('order/list')])
      return p.every(x=>x.netPos===0) && o.filter(x=>x.accountId===id).every(x=>['Filled','Canceled','Completed','Expired','Rejected'].includes(x.ordStatus))
    },
    async stats(id) {
      const [cash,pos]=await Promise.all([call('cashBalance/getcashbalancesnapshot',{accountId:id}),call('position/deps?masterid='+id)])
      return {balance:cash.totalCashValue,realized:cash.realizedPnL,open:cash.openPnL,positions:pos.filter(p=>p.netPos!==0).length}
    },
    place:body=>call(body.bracket1?'order/placeoso':'order/placeorder',body) }
}
export {practice} from './practice.mjs'
