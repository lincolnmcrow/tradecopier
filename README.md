# Relay · Tradovate trade copier

A Netlify-ready browser app for copying new futures fills 1:1 from one Tradovate account to other accounts available under the same login. Share the deployed URL with friends. Each person signs in separately and manages their own copier. Independent logins cannot subscribe to another person's leader.

## Try it
Open the site in Practice, select Practice A as leader, check Practice B or C, and choose **Start copying**. Press **Buy 1** or **Sell 1** and watch each simulated follower order appear in Session activity. Practice runs locally without OAuth or API access.

## Publish on Netlify
1. Import this GitHub repository into Netlify and choose the `main` branch. The included netlify.toml publishes `public` and deploys `netlify/functions`. Leave the build command empty. Deploy once to get your HTTPS site address.
2. Register a Tradovate OAuth application in Application Settings → API Access → OAuth Registration. Set the redirect URI to your exact production origin with a trailing slash, e.g. `https://your-site.netlify.app/`. Enable the permissions needed to read accounts, contracts, orders and fills, and to place orders. Confirm your registration and intended users have Tradovate API access for the chosen environment.
3. In Netlify project configuration, add `TRADOVATE_CLIENT_ID`, `TRADOVATE_CLIENT_SECRET`, and `TRADOVATE_REDIRECT_URI` with Functions scope. Use the exact URI registered above. Redeploy after setting them. Keep the secret out of Git.
4. On the deployed site choose **Tradovate demo** → **Connect Tradovate**. Sign in, choose your leader and followers and start copying. Use an external Tradovate demo order to verify the leader fill, follower quantity, execution and exit in the Tradovate platform. Each user needs two or more accounts visible in that environment.
5. Share the site address. Live mode requires a fresh connection when switching environments and explicit confirmation when starting.

## Execution behavior
- Before starting, check that account positions match and review working orders in Tradovate. The copier baselines existing fills and does not align starting positions.
- Every three seconds it checks fills. A new leader fill submits one automated market order of the same side, contract and quantity to each follower. Partial fills are separate events. Followers can receive different prices. Working orders, cancellations, brackets, corrections and busted trades are not mirrored as order events.
- The order limit applies to each fill, not total exposure. An oversized or stale fill stops the entire run. Previously submitted follower orders stand. An accepted order ID confirms submission only. Monitor broker executions, including rejections after acceptance.
- Keep the tab visible on an awake computer. Hiding it stops copying. A disconnect, uncertain response, expired token or interrupted polling cycle stops the run. Inspect and reconcile every account in Tradovate before restarting. Restarting baselines the current history and skips fills missed during the interruption.
- Stop prevents further submissions. An in-flight order may complete. Stop does not cancel orders or flatten positions.
- Run only one copier for a given account group. The browser locks concurrent sessions on this origin within the same browser profile. Separate devices, deployments and profiles cannot coordinate.
- OAuth uses a short-lived HTTP-only state cookie and exchanges the authorization code in a Netlify Function. The browser keeps the resulting token in memory and calls Tradovate directly. Refreshing or disconnecting clears the local token. Session activity is in memory and retains the latest 200 entries.

## Local checks
Use Node 20+ and run `node --test`. For local Practice, run `python3 -m http.server 8080 --directory public` and open localhost:8080. Broker OAuth requires the registered HTTPS site and the deployed function.

[Tradovate API](https://api.tradovate.com/) · [OAuth registration](https://tradovate.zendesk.com/hc/en-us/articles/4408935298707-How-Do-I-Register-an-OAuth-App) · [Official OAuth example](https://github.com/tradovate/example-api-oauth)
