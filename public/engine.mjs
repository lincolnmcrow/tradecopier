// Every run takes its own baseline. A stopped run is never resumed.
export async function copySession({ broker, leader, followers, cap, running, log, wait, clock = Date.now, onAccepted = () => {} }) {
  if (!followers.length || new Set([broker.key ?? leader, ...followers.map(a => a.key ?? a.id)]).size !== followers.length + 1)
    throw Error('Choose a leader and distinct followers.')
  if (!Number.isSafeInteger(cap) || cap < 1) throw Error('Enter a positive whole-number order limit.')
  const seen = new Set()
  const fills = async () => {
    const rows = await broker.fills(leader)
    if (!Array.isArray(rows) || rows.some(f => !Number.isSafeInteger(f.id))) throw Error('Incomplete fill history.')
    return rows
  }
  for (const f of await fills()) seen.add(f.id)
  if (!running()) return
  log('Watching new fills')
  while (running()) {
    const last = clock()
    await wait()
    if (!running()) return
    const rows = await fills()
    if (clock() - last > 15000) throw Error('Feed interrupted. Check positions before restarting.')
    for (const f of rows.sort((a,b) => Date.parse(a.timestamp)-Date.parse(b.timestamp) || a.id-b.id)) {
      if (!running()) return
      if (seen.has(f.id)) continue
      seen.add(f.id)
      if (f.active === false) continue
      const order = f.accountId == null ? await broker.order(f.orderId) : f
      if (!Number.isSafeInteger(order.accountId)) throw Error('Unknown fill account.')
      if (order.accountId !== leader) continue
      if (!['Buy','Sell'].includes(f.action) || !Number.isSafeInteger(f.qty) || f.qty < 1 || f.qty > cap)
        throw Error('Leader fill '+f.id+' exceeded the limit or had invalid details. Check positions.')
      const symbol = await broker.symbol(f.contractId)
      if (!symbol) throw Error('Unknown contract. Check positions.')
      for (const account of followers) {
        if (!running()) return
        const destination = account.broker || broker
        if (destination.lookup) {
          const contract = await destination.lookup(symbol)
          if (contract?.name?.toUpperCase() !== symbol.toUpperCase()) throw Error('Exact follower contract unavailable. Check positions.')
        }
        if (!running()) return
        const age = clock() - Date.parse(f.timestamp)
        if (!Number.isFinite(age) || Math.abs(age) > 15000) throw Error('Stale leader fill. Check positions.')
        log(f.action+' '+f.qty+' '+symbol+' → '+account.name+' · sending (fill '+f.id+')')
        const result = await destination.place({accountId:account.id, accountSpec:account.name, action:f.action, symbol, orderQty:f.qty, orderType:'Market', isAutomated:true})
        if (result.failureReason && result.failureReason !== 'Success' || !Number.isSafeInteger(result.orderId))
          throw Error('Order unconfirmed for '+account.name+'. Check Tradovate before restarting.')
        onAccepted(f.qty)
        log(account.name+' · accepted order #'+result.orderId)
      }
    }
  }
}
