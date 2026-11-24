// A single bounded history request. The socket closes when history finishes.
export function tradovateBars(token, symbol, minutes) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket('wss://md.tradovateapi.com/v1/websocket')
    const bars = new Map()
    let done = false
    const timeout = setTimeout(() => finish('Chart timed out. Check market-data access.'), 15000)
    const heartbeat = setInterval(() => { if (socket.readyState === 1) socket.send('[]') }, 2500)
    function finish(error) {
      if (done) return
      done = true
      clearTimeout(timeout); clearInterval(heartbeat); socket.close()
      if (error || !bars.size) reject(Error(error || 'No chart bars returned.'))
      else resolve([...bars.values()])
    }
    socket.onerror = () => finish('Market-data connection failed.')
    socket.onclose = () => finish('Market-data connection closed.')
    socket.onmessage = ({data}) => {
      try {
        if (data === 'o') return socket.send('authorize\n1\n\n' + token)
        if (!data.startsWith('a')) return
        for (const m of JSON.parse(data.slice(1))) {
          if (m.s && m.s !== 200 || m.d?.errorText) return finish('Tradovate denied the chart request. Check symbol and market-data permissions.')
          if (m.i === 1) socket.send('md/getChart\n2\n\n' + JSON.stringify({symbol, chartDescription:{underlyingType:'MinuteBar',elementSize:minutes,elementSizeUnit:'UnderlyingUnits',withHistogram:false},timeRange:{asMuchAsElements:100}}))
          for (const c of m.d?.charts || []) {
            for (const b of c.bars || []) bars.set(b.timestamp,b)
            if (c.eoh) return finish()
          }
        }
      } catch { finish('Unreadable chart response.') }
    }
  })
}

export function draw(canvas, rows) {
  const bars = rows.filter(b=>Number.isFinite(Date.parse(b.timestamp)) && [b.open,b.high,b.low,b.close].every(Number.isFinite)).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)).slice(-100)
  const w = Math.max(280,canvas.clientWidth), h = 224, ratio = window.devicePixelRatio || 1
  canvas.width=w*ratio; canvas.height=h*ratio
  const ctx=canvas.getContext('2d'); ctx.scale(ratio,ratio)
  if (!bars.length) return null
  const low=Math.min(...bars.map(b=>b.low)), high=Math.max(...bars.map(b=>b.high)), span=high-low || Math.abs(high)*0.001 || 1
  const y=p=>12+(high-p)/span*(h-42), right=w-78, dx=right/bars.length
  ctx.font='11px monospace'
  for (let i=0;i<5;i++) {
    const price=high-span*i/4, row=y(price)
    ctx.fillStyle='#263535'; ctx.fillRect(0,row,right,1)
    ctx.fillStyle='#a7b6b2'; ctx.fillText(Number(price.toPrecision(7)).toString(),right+6,row+4)
  }
  bars.forEach((b,i)=>{
    ctx.fillStyle=b.close>=b.open?'#8fe0b4':'#f08d85'
    const x=(i+.5)*dx, body=Math.max(1,dx*.65)
    ctx.fillRect(x,y(b.high),1,Math.max(1,y(b.low)-y(b.high)))
    ctx.fillRect(x-body/2,Math.min(y(b.open),y(b.close)),body,Math.max(1,Math.abs(y(b.close)-y(b.open))))
  })
  ctx.fillStyle='#a7b6b2'
  for (const i of new Set([0,Math.floor((bars.length-1)/2),bars.length-1])) ctx.fillText(new Date(bars[i].timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),Math.min(i*dx,right-56),h-4)
  return bars.at(-1)
}
