# Relay · Tradovate trade copier

A Netlify-ready browser app for copying new futures fills 1:1 from one Tradovate account to other accounts available under the same login. Share the deployed URL with friends. Each person signs in separately and manages their own copier. Independent logins cannot subscribe to another person's leader.

## Try it
Open the site in Practice, select Practice A as leader, check Practice B or C, and choose **Start copying**. Press **Buy 1** or **Sell 1** and watch each simulated follower order appear in Session activity. Practice runs locally without OAuth or API access.

## Publish on Netlify
1. Import this repository into Netlify and choose `main`. Leave the build command empty. The publish directory is `public`. Deploy and share the HTTPS site address. All connection details are entered by each user on the site.
2. Each friend chooses **Tradovate demo** or **Tradovate live** and enters their own username, password, numeric client ID (CID) and API key (secret). Use the dedicated API password if configured for that key. Their key needs account, contract, order and fill access plus order placement permission.
3. Choose a leader and at least one follower visible under that login. Start copying and trade the leader through Tradovate from a separate device or window while keeping the copier visible. Verify a demo entry and exit in the broker platform before using Live.

## Execution behavior
- Before starting, check that account positions match and review working orders in Tradovate. The copier baselines existing fills and does not align starting positions.
- Every three seconds it checks fills. A new leader fill submits one automated market order of the same side, contract and quantity to each follower. Partial fills are separate events. Followers can receive different prices. Working orders, cancellations, brackets, corrections and busted trades are not mirrored as order events.
- The order limit applies to each fill, not total exposure. An oversized or stale fill stops the entire run. Previously submitted follower orders stand. An accepted order ID confirms submission only. Monitor broker executions, including rejections after acceptance.
- Keep the tab visible on an awake computer. Hiding it stops copying. A disconnect, uncertain response, expired token or interrupted polling cycle stops the run. Inspect and reconcile every account in Tradovate before restarting. Restarting baselines the current history and skips fills missed during the interruption.
- Stop prevents further submissions. An in-flight order may complete. Stop does not cancel orders or flatten positions.
- Run only one copier for a given account group. The browser locks concurrent sessions on this origin within the same browser profile. Separate devices, deployments and profiles cannot coordinate.
- Credentials go directly from the browser to the selected Tradovate API over HTTPS. The app stores only a random device identifier in local storage. The access token and activity history stay in tab memory. Refresh to clear the session, or stop and disconnect to switch users.

## Local checks
Use Node 20+ and run `node --test`. For local Practice, run `python3 -m http.server 8080 --directory public` and open localhost:8080.

[Tradovate API](https://api.tradovate.com/)
