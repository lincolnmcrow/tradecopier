import { randomBytes } from 'node:crypto'

export default async function oauth(req) {
  const headers = { 'Cache-Control': 'no-store' }
  const json = (body, status = 200) => Response.json(body, { status, headers })
  const origin = new URL(req.url).origin
  if (req.method !== 'POST' || req.headers.get('Origin') !== origin)
    return json({ error: 'Open the copier to connect.' }, 403)
  const id = process.env.TRADOVATE_CLIENT_ID
  const secret = process.env.TRADOVATE_CLIENT_SECRET
  const redirect = process.env.TRADOVATE_REDIRECT_URI
  if (!id || !secret || redirect !== origin + '/')
    return json({ error: 'Set the Tradovate OAuth variables for this site and redeploy.' }, 503)
  try {
    const body = await req.json()
    const cookie = '__Host-copyflow='
    const flags = '; Path=/; Secure; HttpOnly; SameSite=Lax'
    if (body.start === true) {
      const state = randomBytes(32).toString('hex')
      headers['Set-Cookie'] = cookie + state + flags + '; Max-Age=600'
      const url = new URL('https://trader.tradovate.com/oauth')
      url.search = new URLSearchParams({response_type:'code', client_id:id, redirect_uri:redirect, state})
      return json({url:url.href})
    }
    const expected = (req.headers.get('cookie') || '').split(/;\s*/).find(x => x.startsWith(cookie))?.slice(cookie.length)
    headers['Set-Cookie'] = cookie + flags + '; Max-Age=0'
    if (!expected || expected !== body.state || typeof body.code !== 'string')
      return json({error:'Sign-in expired. Connect again.'}, 400)
    const result = await fetch('https://live.tradovateapi.com/auth/oauthtoken', {
      method:'POST', signal:AbortSignal.timeout(10000),
      body:new URLSearchParams({grant_type:'authorization_code', client_id:id, client_secret:secret, redirect_uri:redirect, code:body.code})
    })
    const data = await result.json()
    if (!result.ok || !data.access_token) return json({error:'Tradovate declined sign-in. Connect again.'}, 401)
    return json({token:data.access_token})
  } catch {
    return json({error:'Could not finish sign-in. Try connecting again.'}, 502)
  }
}
