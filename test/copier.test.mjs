import test from 'node:test'
import assert from 'node:assert/strict'
import {copySession} from '../public/engine.mjs'
import {practice} from '../public/broker.mjs'
import oauth from '../netlify/functions/oauth.mjs'

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
test('OAuth denies cross-origin requests',async()=>{
  const response=await oauth(new Request('https://example.com/auth',{method:'POST',headers:{Origin:'https://elsewhere.example'}}))
  assert.equal(response.status,403)
})
