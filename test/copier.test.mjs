import test from 'node:test'
import assert from 'node:assert/strict'
import {copySession} from '../public/engine.mjs'
import {practice, signIn, tradovate} from '../public/broker.mjs'

function fixture(cap=1) {
  const broker=practice(), sent=[], events=[]
  broker.add(1,'Sell',1)
  let active=true, polls=0
  const place=broker.place
  broker.place=async body=>{sent.push(body); return place(body)}
  const config={broker,leader:1,followers:[{id:2,name:'Practice B'},{id:3,name:'Practice C'}],cap,
    log:text=>events.push(text),running:()=>active,wait:async()=>{
      if (++polls===1) broker.add(1,'Buy',1)
      if (polls===3) active=false
    }}
  return {broker,sent,events,config,stop:()=>{active=false}}
}
test('new leader fill fans out once, ignoring history, repeated snapshots and follower fills',async()=>{
  const f=fixture()
  await copySession(f.config)
  assert.deepEqual(f.sent.map(o=>[o.accountId,o.action,o.orderQty,o.isAutomated]),[[2,'Buy',1,true],[3,'Buy',1,true]])
})
test('over-limit fill stops before any order',async()=>{
  const f=fixture()
  f.config.wait=async()=>f.broker.add(1,'Buy',2)
  await assert.rejects(copySession(f.config),/limit/)
  assert.equal(f.sent.length,0)
})
test('uncertain submission stops without retry',async()=>{
  const f=fixture(); let calls=0
  f.broker.place=async()=>{calls++; return {}}
  await assert.rejects(copySession(f.config),/unconfirmed/)
  assert.equal(calls,1)
})
test('stop during lookup prevents submission',async()=>{
  const f=fixture()
  f.broker.symbol=async()=>{f.stop(); return 'MNQ'}
  await copySession(f.config)
  assert.equal(f.sent.length,0)
})
test('same account cannot be a follower',async()=>{
  const f=fixture(); f.config.followers=[{id:1}]
  await assert.rejects(copySession(f.config),/distinct/)
})
test('separate logins use their selected broker and their own token', async t => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({url, options})
    return Response.json(options.method === 'POST' ? {accessToken: 'token-' + JSON.parse(options.body).name} : [])
  })
  for (const [mode, name] of [['demo', 'alice'], ['live', 'bob']]) {
    const token = await signIn(mode, {name, password:'example', cid:'123', sec:'sample-key'}, 'test-device')
    await tradovate(mode, token).accounts()
    const [auth, accounts] = calls.slice(-2)
    assert.equal(auth.url, 'https://' + mode + '.tradovateapi.com/v1/auth/accesstokenrequest')
    assert.equal(JSON.parse(auth.options.body).cid, 123)
    assert.equal(accounts.options.headers.Authorization, 'Bearer token-' + name)
  }
})
test('failed sign-in returns a generic error without echoing credentials', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({errorText:'sensitive example'}))
  await assert.rejects(signIn('demo',{name:'alice',password:'example',cid:'123',sec:'sample'},'device'),
    err => err.message.includes('declined') && !err.message.includes('sensitive'))
})

import {limitTicket} from '../public/ticket.mjs'
import {connectProjectX} from '../public/projectx.mjs'
import {tradovateBars} from '../public/chart.mjs'
import linked from '../netlify/functions/linked.mjs'
import {linkedTradovate} from '../public/linked.mjs'

test('long and short tickets have opposite-side stops and targets',()=>{
  for(const [side,stop,target,exit] of [['Buy',95,110,'Sell'],['Sell',105,90,'Buy']]){
    const draft={symbol:'MNQZ6',qty:2,entry:100,stop,target,action:side}
    const o=limitTicket(draft,{id:7,name:'test'})
    assert.deepEqual(o.bracket1,{action:exit,orderType:'Stop',stopPrice:stop})
    assert.deepEqual(o.bracket2,{action:exit,orderType:'Limit',price:target})
    assert.throws(()=>limitTicket({...draft,stop:target},{id:7}),/loss side/)
  }
})
test('same numeric ID at different brokers routes to the selected follower',async()=>{
  const f=fixture()
  f.broker.key='demo:1'
  const foreign=practice()
  f.config.followers=[{id:1,key:'projectx:1',name:'Foreign account',broker:foreign}]
  await copySession(f.config)
  assert.equal(f.sent.length,0)
  assert.equal((await foreign.fills())[0].accountId,1)
  assert.equal((await foreign.fills())[0].contractId,'MNQ')
})
test('ProjectX retrieves exact-contract history and sends signed bracket offsets',async t=>{
  const calls=[]
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    const path=new URL(url).pathname,body=JSON.parse(opts.body);calls.push({path,body})
    const data={
      '/api/Auth/loginKey':{token:'fake'},'/api/Contract/search':{contracts:[{name:'MNQZ6',id:'CON.X',tickSize:.25}]},
      '/api/History/retrieveBars':{bars:[{t:'2026-11-20T15:00:00Z',o:100,h:102,l:99,c:101}]},
      '/api/Order/place':{orderId:10}
    }
    return Response.json({success:true,errorCode:0,...data[path]})
  })
  const px=await connectProjectX('https://api.topstepx.com','sample','sample',false)
  assert.equal((await px.bars('MNQZ6',5))[0].close,101)
  const o=limitTicket({symbol:'MNQZ6',qty:1,entry:100,action:'Buy',stop:99,target:102},{id:10,name:'test'})
  await px.place(o)
  assert.deepEqual(calls.at(-1).body.stopLossBracket,{type:4,ticks:-4})
  assert.deepEqual(calls.at(-1).body.takeProfitBracket,{type:1,ticks:8})
})
test('chart socket authenticates and merges repeated OHLC timestamps',async t=>{
  class Socket {
    static current
    constructor(url){assert.equal(url,'wss://md.tradovateapi.com/v1/websocket');Socket.current=this;this.sent=[]}
    send(v){this.sent.push(v)}
    close(){this.closed=true}
  }
  const original=globalThis.WebSocket
  globalThis.WebSocket=Socket
  t.after(()=>{globalThis.WebSocket=original})
  const promise=tradovateBars('md-token','NQZ6',5),socket=Socket.current
  const emit=data=>socket.onmessage({data})
  emit('o');emit('a'+JSON.stringify([{i:1,s:200}]))
  assert.match(socket.sent[0],/md-token/)
  assert.match(socket.sent[1],/NQZ6/)
  emit('a'+JSON.stringify([{e:'chart',d:{charts:[{bars:[{timestamp:'one',close:3},{timestamp:'one',close:4}]},{eoh:true}]}}]))
  assert.deepEqual(await promise,[{timestamp:'one',close:4}])
  assert.equal(socket.closed,true)
})
test('CrossTrade forwards linked account orders with both exits and checks the returned order ID',async t=>{
  t.mock.method(globalThis,'fetch',async(url,opts)=>{
    const b=JSON.parse(opts.body)
    if(b.op==='accounts')return Response.json({success:true,data:[{accountId:'17',name:'PROP',active:true,environment:'demo'}]})
    assert.equal(b.account,'PROP')
    assert.equal(b.order.stopLoss,99)
    assert.equal(b.order.takeProfit,102)
    return Response.json({success:true,response:{orderId:123}})
  })
  const api=linkedTradovate('test');const [a]=await api.accounts()
  const result=await api.place(limitTicket({symbol:'NQZ6',action:'Buy',qty:1,entry:100,stop:99,target:102},a))
  assert.equal(result.orderId,123)
})
test('CrossTrade function rejects foreign origins and unknown operations',async()=>{
  const send=(origin,op)=>linked(new Request('https://desk.test/.netlify/functions/linked',{method:'POST',headers:{Origin:origin,Authorization:'Bearer sample'},body:JSON.stringify({op,account:'sample'})}))
  assert.equal((await send('https://elsewhere.test','place')).status,403)
  assert.equal((await send('https://desk.test','unknown')).status,400)
})
test('practice snapshots realize gains once on a partial close',async()=>{
  const b=practice();b.add(1,'Buy',2,'MNQ',100);b.add(1,'Sell',1,'MNQ',102)
  const s=await b.stats(1);assert.equal(s.balance,50004);assert.equal(s.realized,4);assert.equal(s.positions,1)
})

import {submitTicket} from '../public/ticket.mjs'
test('group tickets place both exits on each destination and stop on an unconfirmed response',async()=>{
  const sent=[], marked=[]
  const targets=[1,2,3].map(id=>({id,key:'broker:'+id,name:'A'+id,broker:{
    lookup:async name=>({name}),place:async o=>{sent.push(o);return id===2?{}:{orderId:id}}
  }}))
  const order=limitTicket({symbol:'NQZ6',action:'Sell',qty:1,entry:100,stop:102,target:98},targets[0])
  await assert.rejects(submitTicket(order,targets,{group:true,log:()=>{},mark:key=>marked.push(key)}),/unconfirmed/)
  assert.deepEqual(marked,['broker:1','broker:2'])
  assert.deepEqual(sent.map(o=>[o.accountId,o.bracket1.stopPrice,o.bracket2.price,o.isAutomated]),[[1,102,98,true],[2,102,98,true]])
})
test('group preflights exact contracts before submitting the first order',async()=>{
  let sent=0
  const targets=['NQZ6','MNQZ6'].map(name=>({broker:{lookup:async()=>({name}),place:async()=>{sent++}}}))
  await assert.rejects(submitTicket({symbol:'NQZ6'},targets,{group:true}),/Exact contract/)
  assert.equal(sent,0)
})
