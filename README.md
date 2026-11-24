# Relay trading desk

Deploy Relay once on Netlify and share the HTTPS address. Each trader connects their own accounts in their browser. Import this repository, select `main`, leave the build command empty and use `public` as the publish directory. Netlify discovers the included function automatically. No site-wide trading credentials or environment variables are required.

## Try the desk

**Practice** starts with three simulated accounts. Choose a leader, check followers, start copying and use **Buy 1** or **Sell 1** to generate a leader fill. The practice chart and account values are synthetic. Each practice account starts with 50,000 and the simulator uses a fixed $2 point multiplier for every symbol, with no fees or slippage. Pending practice orders advance on fill polls, stats refreshes and chart loads.

## Connections

Add each login under **Connections**. The first real connection replaces the practice accounts. Account selectors include the connection label. The copier prevents the same underlying Tradovate account from being added twice through direct and CrossTrade connections. Use one desk per account group. Disable overlapping external copiers on those accounts.

| Account | Route in Relay | What each trader needs |
| --- | --- | --- |
| Topstep | ProjectX / TopstepX | Platform username and API key. The default gateway is api.topstepx.com. The sim/live data selector chooses the market-data subscription, not whether an order reaches a funded account. |
| Apex Trader Funding | CrossTrade, Tradovate-based accounts only | A Tradovate identity that links through CrossTrade Link Demo and returns the account. |
| FundedNext Futures | CrossTrade, Tradovate-based accounts only | The trader's own eligible linked futures accounts. |
| Lucid Trading | CrossTrade, Tradovate-based accounts only | Link the Tradovate identity through CrossTrade Link Demo. |
| Tradeify | CrossTrade, Tradovate-based accounts only | Link the Tradovate identity through CrossTrade Link Demo. Rithmic and WealthCharts logins use different platforms. |
| Alpha Futures | Unavailable | Alpha ended its Tradovate connection. Relay has no AlphaTrader, Plus500 or Volumetrica execution integration. |
| Personal Tradovate | Tradovate demo/live | API-enabled username, API password, client ID and key. Use the dedicated password if configured. |

CrossTrade is optional and requires the trader's own Trading API access (Pro or above). After linking the identities in CrossTrade, enter its **bearer token** in Relay. This route loads active demo-environment accounts, including eligible prop accounts. Availability depends on the account appearing in the provider's response and its order permissions. The Netlify function forwards the bearer token to a fixed set of CrossTrade endpoints. The function does not store or log it. ProjectX and direct Tradovate credentials go directly to the selected API. Tokens stay in tab memory. The browser retains a Tradovate device ID and group-order markers to help prevent overlapping execution modes.

[CrossTrade linking](https://crosstrade.io/docs/tradovate/linking-your-account) · [CrossTrade API access](https://crosstrade.io/docs/api/overview) · [TopstepX API](https://help.topstep.com/en/articles/11187768-topstepx-api-access) · [Alpha Futures platforms](https://help.alpha-futures.com/en/articles/10525305-trading-platforms)

## Placing and copying trades

Use a specific broker contract including expiry, e.g. MNQZ6. The desk has no hard-coded list of products. Each destination must recognize the exact same symbol and permit the trade. The app does not substitute a different expiry or a micro/mini contract.

- **Leader only:** Set the side, quantity and limit entry. Stop loss and take profit are optional absolute price inputs. Review the reward/risk preview, destination and order details. A Tradovate bracket uses a parent OSO order with opposite-side exits. ProjectX uses tick offsets from the fill based on the entry-to-exit distances and the contract tick size. ProjectX requires Auto OCO Brackets mode for attached exits.
- **Leader + checked followers:** Stop fill copying, select the accounts, enter a limit entry, stop and target, then review the whole group. Each destination receives a separate order with attached exits. Different accounts may fill differently. A failure stops further submissions. Earlier orders remain with their brokers. Check every destination before attempting another order.
- **Start copying:** Start with aligned positions and review existing working orders. New leader fills are detected by polling approximately every three seconds. A follower receives a market order for the same side, symbol and quantity. A leader's working brackets are not installed on followers in this mode. Followers copy an exit when the leader's exit fills and the desk is running. For independently resting exits use the group ticket. After a group ticket, the desk checks the affected accounts are flat and free of working orders before switching to fill copying.
- **Stop copying:** New submissions stop. An in-flight order may still complete. Keep the browser visible and awake. A hidden tab, ambiguous response, oversized fill, stale fill or interrupted poll stops the session. Reconcile positions and working orders at the brokers. Restarting skips historical fills. Fill corrections and busted executions require manual reconciliation.
- **Order status:** Accepted IDs confirm submission only. Inspect fills, working exits and partial submissions in each broker platform. Modify, cancel and flatten from the broker platform. The copier's limit applies per fill or group-ticket quantity on each account, not aggregate exposure.
- **Ownership:** Each friend runs their own session. Follow the prop firm's rules for the specific account and account owner.

## Charts and account statistics

Select a chart source separately from the account receiving the order. **Load chart** requests up to 100 candles from the selected ProjectX history API or Tradovate market-data WebSocket. Choose 1, 5 or 15 minutes. The timestamp and OHLC are from the last bar returned. These are point-in-time snapshots. Broker data access depends on the user's entitlements. CrossTrade's Tradovate REST surface does not supply chart bars. An isolated TradingView chart is also available with its own symbol field and provider-dependent data delay. Changing its symbol does not change the order contract.

**Refresh account** reads the leader's account snapshot. Balance, realized P&L, open P&L and position count are shown when the provider supplies them. Missing fields show a dash. **Copies accepted** counts confirmed follower submissions in the current desk session. It is not a fill or win count. Chart and statistics failures leave order controls independent.

[ProjectX bars](https://gateway.docs.projectx.com/docs/api-reference/market-data/retrieve-bars/) · [ProjectX bracket orders](https://gateway.docs.projectx.com/docs/api-reference/order/order-place/) · [Tradovate API](https://api.tradovate.com/) · [Tradovate API eligibility and data](https://support.ninjatrader.com/s/article/Tradovate-API-Access?language=en_US)

## Local verification

Run `node --test` (Node 22+). For the local practice desk, run `python3 -m http.server 8080 --directory public` and open localhost:8080. Use Netlify Dev or a Netlify deployment to exercise the CrossTrade function. The automated suite uses simulated accounts and mocked providers. Verify account discovery, chart permissions, entry, both exits and follower quantities with broker demo accounts before funded use.
