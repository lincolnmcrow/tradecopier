export function gateway(raw) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    !(url.hostname === 'api.topstepx.com' || url.hostname.endsWith('.projectx.com'))) throw Error('Use the official HTTPS gateway from your firm.')
  return url.origin
}
export async function connectProjectX(origin, userName, apiKey, live) {
  const base=gateway(origin)
  let token
  async function call(path, body) {
    const headers={'Content-Type':'application/json'}
    if (token) headers.Authorization='Bearer '+token
    const response=await fetch(base+'/api/'+path,{method:'POST',headers,body:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(10000)})
    const data=await response.json()
    if (!response.ok || !data.success || data.errorCode) throw Error('ProjectX '+path+' failed (code '+(data.errorCode || response.status)+'). '+(path==='Order/place'?'Review orders and bracket mode in the platform.':'Check your access.'))
    return data
  }
  token=(await call('Auth/loginKey',{userName,apiKey})).token
  if (!token) throw Error('ProjectX did not return a session token.')
  const contracts=new Map()
  async function lookup(symbol) {
    if (contracts.has(symbol)) return contracts.get(symbol)
    const {contracts:rows}=await call('Contract/search',{searchText:symbol,live})
    const hits=rows.filter(c=>c.name.toUpperCase()===symbol.toUpperCase())
    if (hits.length!==1) throw Error('Exact contract unavailable on ProjectX: '+symbol)
    contracts.set(symbol,hits[0]); return hits[0]
  }
  const accounts=async()=>(await call('Account/search',{onlyActiveAccounts:true})).accounts.filter(a=>a.canTrade && a.isVisible!==false)
  return {accounts,lookup,
    fills:async accountId=>(await call('Trade/search',{accountId,startTimestamp:new Date(Date.now()-120000).toISOString()})).trades.map(t=>({
      id:t.id,accountId:t.accountId,contractId:t.contractId,orderId:t.orderId,qty:t.size,action:['Buy','Sell'][t.side],timestamp:t.creationTimestamp,active:!t.voided})),
    symbol:async id=>(await call('Contract/searchById',{contractId:id})).contract.name,
    async place(o) {
      const c=await lookup(o.symbol)
      const body={accountId:o.accountId,contractId:c.id,side:o.action==='Buy'?0:1,type:o.orderType==='Limit'?1:2,size:o.orderQty}
      if (body.type===1) body.limitPrice=o.price
      for (const b of [o.bracket1,o.bracket2].filter(Boolean)) {
        const isStop=b.orderType==='Stop', ticks=((isStop?b.stopPrice:b.price)-o.price)/c.tickSize
        if (!Number.isFinite(ticks) || Math.abs(ticks-Math.round(ticks))>1e-6 || !Math.round(ticks)) throw Error('Bracket prices must align with the contract tick size.')
        body[isStop?'stopLossBracket':'takeProfitBracket']={type:isStop?4:1,ticks:Math.round(ticks)}
      }
      return call('Order/place',body)
    },
    async idle(id) {
      const [p,o]=await Promise.all([call('Position/searchOpen',{accountId:id}),call('Order/searchOpen',{accountId:id})])
      return p.positions.length===0 && o.orders.length===0
    },
    async stats(id) {
      const [list,pos]=await Promise.all([accounts(),call('Position/searchOpen',{accountId:id})])
      return {balance:list.find(a=>a.id===id)?.balance, positions:pos.positions.length}
    },
    async bars(symbol,minutes) {
      const c=await lookup(symbol), end=new Date()
      const data=await call('History/retrieveBars',{contractId:c.id,live,startTime:new Date(+end-7*86400000).toISOString(),endTime:end.toISOString(),unit:2,unitNumber:minutes,limit:100,includePartialBar:true})
      return data.bars.map(b=>({timestamp:b.t,open:b.o,high:b.h,low:b.l,close:b.c}))
    }
  }
}
