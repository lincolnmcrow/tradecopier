export function linkedTradovate(token) {
  const names=new Map()
  async function call(op,account,order) {
    const r=await fetch('/.netlify/functions/linked',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},cache:'no-store',body:JSON.stringify({op,account,order}),signal:AbortSignal.timeout(11000)})
    const d=await r.json()
    if(!r.ok||d.success!==true) throw Error('CrossTrade '+op+' failed ('+(d.error||r.status)+'). Check the account in CrossTrade.')
    return d
  }
  return {
    async accounts(){
      const {data}=await call('accounts')
      return data.filter(a=>a.active&&!a.archived&&a.environment==='demo').map(a=>{
        const id=Number(a.accountId)
        if(names.has(id)&&names.get(id)!==a.name)throw Error('Ambiguous account returned by CrossTrade.')
        names.set(id,a.name)
        return {id,name:a.name}
      })
    },
    async fills(id){return (await call('fills',names.get(id))).data.map(f=>({...f,contractId:f.instrument}))},
    symbol:async instrument=>instrument,
    async lookup(name){
      if(!/^.+[FGHJKMNQUVXZ]\d{1,4}$/.test(name))throw Error('Enter a specific dated futures contract.')
      return {name}
    },
    async idle(id){
      const snapshot=await call('snapshot',names.get(id))
      const a=snapshot.accounts.find(a=>a.environment==='demo'&&Number(a.accountId)===id)
      return a && !a.error && a.positions.length===0 && a.workingOrders.length===0
    },
    async stats(id){
      const {data}=await call('stats',names.get(id))
      return {balance:data.balance?.totalCashValue,open:data.balance?.openPnL,realized:data.balance?.realizedPnL}
    },
    async place(o){
      const order={instrument:o.symbol,action:o.action.toLowerCase(),qty:o.orderQty,orderType:o.orderType.toLowerCase()}
      if(o.orderType==='Limit')order.limitPrice=o.price
      for(const b of [o.bracket1,o.bracket2].filter(Boolean)){
        if(b.orderType==='Stop')order.stopLoss=b.stopPrice
        else order.takeProfit=b.price
      }
      return (await call('place',names.get(o.accountId),order)).response
    }
  }
}
