const params=new URLSearchParams(location.hash.slice(1))
const widget=document.createElement('script')
widget.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
widget.async=true
widget.textContent=JSON.stringify({width:'100%',height:310,symbol:params.get('symbol'),interval:params.get('minutes'),timezone:'Etc/UTC',theme:'dark',style:'1',locale:'en',allow_symbol_change:false})
document.querySelector('.tradingview-widget-container').append(widget)
