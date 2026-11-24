export function tradovate(mode, token) {
  const base = mode === 'live' ? 'https://live.tradovateapi.com/v1/' : 'https://demo.tradovateapi.com/v1/'
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
