// Forward only these CrossTrade Trading API operations. Never retain bearer tokens.
export default async function linked(req) {
  const reply=(data,status)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
  if(req.method!=='POST'||req.headers.get('Origin')!==new URL(req.url).origin) return reply({error:'origin'},403)
  const auth=req.headers.get('Authorization')
  if(!auth?.startsWith('Bearer ')) return reply({error:'missing_token'},401)
  try {
    const {op,account,order}=await req.json()
    if(op!=='accounts' && (typeof account!=='string'||!account.length||account.length>150||/[\/\\\x00-\x1f]/.test(account)||['.','..'].includes(account))) return reply({error:'invalid_account'},400)
    const base='https://app.crosstrade.io/v1/api/tv/accounts', one=base+'/'+encodeURIComponent(account)
    const paths={accounts:base,stats:one,snapshot:base+'/snapshot',fills:one+'/fills',place:one+'/orders/place'}
    if(!Object.hasOwn(paths,op)) return reply({error:'invalid_operation'},400)
    const placing=op==='place'
    if(placing && (!order||!['buy','sell'].includes(order.action)||!['limit','market'].includes(order.orderType)||!Number.isSafeInteger(order.qty)||order.qty<1||typeof order.instrument!=='string'||!order.instrument.length))
      return reply({error:'invalid_order'},400)
    if(placing && Object.keys(order).some(k=>!['instrument','action','qty','orderType','limitPrice','stopLoss','takeProfit'].includes(k))) return reply({error:'invalid_order_field'},400)
    const response=await fetch(paths[op],{method:placing?'POST':'GET',headers:{Authorization:auth,'Content-Type':'application/json'},body:placing?JSON.stringify(order):undefined,redirect:'error',signal:AbortSignal.timeout(8000)})
    return reply(await response.json(),response.status)
  } catch {return reply({error:'request_unconfirmed'},502)}
}
