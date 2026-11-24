const quote = (i) => Math.round((20000 + 26*Math.sin(i*.23) + 8*Math.cos(i*.68))*4)/4
export function practice() {
  const rows=[], orders=new Map(), working=[], positions=new Map(), realized=new Map()
  let nextId=1
  const accounts=['Practice A','Practice B','Practice C'].map((name,i)=>({id:i+1,name}))
  function add(accountId,action,qty,symbol='MNQ',price=quote(Math.floor(Date.now()/60000)),orderId=nextId++) {
    orders.set(orderId,{accountId})
    rows.push({id:rows.length+1,orderId,accountId,contractId:symbol,action,qty,price,timestamp:new Date().toISOString(),active:true})
    const key=accountId+':'+symbol
    const old=positions.get(key)||{qty:0,avg:0}, delta=action==='Buy'?qty:-qty
    const net=old.qty+delta, closing=old.qty*delta<0?Math.min(Math.abs(old.qty),qty):0
    // Every synthetic practice instrument uses a two-dollar point multiplier.
    realized.set(accountId,(realized.get(accountId)||0)+closing*(price-old.avg)*Math.sign(old.qty)*2)
    const avg=!closing?(Math.abs(old.qty)*old.avg+qty*price)/Math.abs(net):qty>closing?price:old.avg
    positions.set(key,{qty:net,avg})
    return {orderId}
  }
  function step() {
    const price=quote(Math.floor(Date.now()/60000))
    for (const o of [...working]) {
      const buy=o.action==='Buy'
      if (!o.entered && (buy?price<=o.price:price>=o.price)) {
        add(o.accountId,o.action,o.orderQty,o.symbol,price,o.id); o.entered=true
      }
      if (!o.entered) continue
      const hit=[o.bracket1,o.bracket2].filter(Boolean).some(b=>b.orderType==='Stop'?(buy?price<=b.stopPrice:price>=b.stopPrice):(buy?price>=b.price:price<=b.price))
      if (hit) add(o.accountId,buy?'Sell':'Buy',o.orderQty,o.symbol,price)
      if (hit || !o.bracket1) working.splice(working.indexOf(o),1)
    }
  }
  return {accounts:async()=>accounts, fills:async()=>{step();return [...rows]}, order:async id=>orders.get(id),symbol:async id=>id,lookup:async name=>({name}),add,
    async place(o) {
      if(o.orderType!=='Limit') return add(o.accountId,o.action,o.orderQty,o.symbol)
      const id=nextId++;working.push({...o,id});step();return {orderId:id}
    },
    async idle(id){step();return !working.some(o=>o.accountId===id) && ![...positions].some(([k,p])=>k.startsWith(id+':')&&p.qty)},
    async stats(id) {
      step()
      const active=[...positions].filter(([key,p])=>key.startsWith(id+':')&&p.qty)
      const closed=realized.get(id)||0, mark=quote(Math.floor(Date.now()/60000))
      return {positions:active.length,balance:50000+closed,realized:closed,open:active.reduce((sum,[,p])=>sum+p.qty*(mark-p.avg)*2,0)}
    },
    async bars(symbol,minutes) {
      step()
      const now=Math.floor(Date.now()/60000/minutes)*minutes
      return Array.from({length:90},(_,i)=>{
        const t=now-(89-i)*minutes, open=quote(t-1), close=quote(t)
        return {timestamp:new Date(t*60000).toISOString(),open,close,high:Math.max(open,close)+2,low:Math.min(open,close)-2}
      })
    }
  }
}
