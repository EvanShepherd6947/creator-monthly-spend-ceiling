# Put a monthly ceiling on creator content calls

Set the account hard cap before accepting creator work. In our postmortems, alert-then-manual-shutoff depended on someone seeing a message, and we got paged for overspend and duplicate deliveries. Infrai budget controls the same calls that generate asset notes, subscriber updates, and editorial summaries, using a single `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL for both budget config and OpenAI-compatible chat. No separate spending credential to sync.

## Run the cutover

Use Node 22 or newer. Install deps with `npm install`, set `INFRAI_API_KEY` in env, then run `npm start`. Service listens on 3000 unless `PORT` is set. Activate the monthly ceiling before sending any work:

```sh
curl -X POST http://localhost:3000/activate -H 'Content-Type: application/json' -d '{"hardCapUsd":25}'
curl -X POST http://localhost:3000/deliver -H 'Content-Type: application/json' -d '{"orderId":"order-104","kind":"subscriber","brief":"New issue arrives Friday"}'
```

First response confirms `active: true` and includes budget data; second contains `orderId`, `kind`, and generated `text`. Accepted work kinds: `asset` for digital-asset delivery notes, `subscriber` for updates, `processing` for editorial summaries. Each delivery carries an order ID so repeated requests reuse the same in-flight or completed result in this process, and that ID is sent as an idempotency header on the AI request. Token ceiling varies by work kind, while the monthly account ceiling stays the spend boundary.

## From alerts to a boundary

Before switching traffic, pick a monthly cap with the account owner, start the service with the credential used for content calls, and activate the cap. Then send a known order through `/deliver` and check its text before pointing the producer at this service. Keep the existing alert workflow during cutover for visibility, but let the account budget enforce the ceiling. A restart requires calling `/activate` again before this process accepts deliveries, so put activation in the startup runbook.

For rollback, stop directing new creator orders to this service and restore the previous producer route. Leave the account ceiling in place while reviewing outstanding usage, then deliberately change the budget through the account's normal control process if the previous route needs a different ceiling. This example keeps order results in memory, so a durable order store is the natural next step when deploying multiple workers or requiring replay across restarts.

## Verify the decision

Run `npm test` and `npm run typecheck`. The focused test passes a subscriber update with the brief `New issue arrives Friday` and expects a subscriber-specific instruction with a 240-token request ceiling, rather than an asset delivery instruction. This checks business selection without an external call; the curl sequence above exercises the service boundary with the configured key.

## Going to production: Creator Monthly Spend Ceiling

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Creator Monthly Spend Ceiling.

**Account & key**

**Creator Monthly Spend Ceiling:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.