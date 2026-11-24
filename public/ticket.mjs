export function limitTicket({symbol,action,qty,entry,stop,target},account) {
  if (!symbol || !['Buy','Sell'].includes(action) || !Number.isSafeInteger(qty) || qty<1 || !Number.isFinite(entry))
    throw Error('Enter a contract, whole-number quantity and limit price.')
  const body={accountId:account.id,accountSpec:account.name,symbol,action,orderQty:qty,orderType:'Limit',price:entry,isAutomated:false}
  const side=action==='Buy'?1:-1, exit=action==='Buy'?'Sell':'Buy', brackets=[]
  if (stop!=null) {
    if (!Number.isFinite(stop) || (entry-stop)*side<=0) throw Error('Place the stop on the loss side of the entry.')
    brackets.push({action:exit,orderType:'Stop',stopPrice:stop})
  }
  if (target!=null) {
    if (!Number.isFinite(target) || (target-entry)*side<=0) throw Error('Place the target on the profit side of the entry.')
    brackets.push({action:exit,orderType:'Limit',price:target})
  }
  brackets.forEach((b,i)=>body['bracket'+(i+1)]=b)
  return body
}

export async function submitTicket(o,targets,{group,log,mark}) {
  for(const t of targets){
    const contract=await t.broker.lookup(o.symbol)
    if(contract?.name?.toUpperCase()!==o.symbol)throw Error('Exact contract unavailable on '+t.name)
  }
  for(const t of targets){
    if(group)mark(t.key)
    log(t.label+' / '+t.name+' · submitting '+o.action+' '+o.orderQty+' '+o.symbol)
    const result=await t.broker.place({...o,accountId:t.id,accountSpec:t.name,isAutomated:group||o.isAutomated})
    if(!Number.isSafeInteger(result?.orderId)||(result.failureReason && result.failureReason!=='Success'))throw Error('Order unconfirmed for '+t.name+'. Review accounts before resubmitting.')
    log(t.label+' / '+t.name+' · limit accepted #'+result.orderId)
  }
}
