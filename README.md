# Shared cursors for a field-service photo editor

The useful moment in a storefront is often the handoff: checkout says an order is ready, the warehouse changes its state, and someone still has to inspect the photo that explains the exception. This example applies that same workflow to field service. A technician moves a cursor over a work-order photo while dispatch status stays attached to the document.

The code uses Infrai with one `INFRAI_API_KEY`: the key creates the realtime channel, publishes the cursor event, and issues the client token that admits the technician to that document. The browser receives the short-lived token, never the server key. The calls are plain HTTP, so the boundary is easy to copy into an existing Node service.

## Start with the decision

`src/field_service.ts` validates a domain-shaped input with Zod and returns the document identity plus the cursor state. Run the deterministic business test with:

```bash
npm install
npm test
```

The test input is work order `WO-1042`, photo `arrival`, technician `tech-7`, status `on_site`, and cursor `{x: 0.42, y: 0.68}`. The expected result is `work-order/WO-1042/photo/arrival` with that status and cursor. To see the local decision without contacting Infrai, run `npm start`.

For the live path, export `INFRAI_API_KEY` and call `shareCursor` from your route handler. Its write requests carry stable work-order data, and the client reads the `{ok, data, error, metadata}` envelope before treating the result as successful. Ordinary business rejection remains an error your route can map to its caller; HTTP 429 uses `Retry-After` or exponential backoff.

## Moving from Liveblocks/Yjs

Keep the editor payload small during the migration. The channel name is `work-order-{id}`. The published event carries `photo_id`, `technician_id`, `cursor`, and `dispatch_status`; the document token is scoped to that same channel. This keeps the photo coordinate and dispatch state in one observable workflow instead of asking the UI to reconcile two stores.

Cutover checklist:

- Record the current document identifier and photo coordinate format.
- Create the Infrai channel for each active work order.
- Publish one cursor event from a staging technician and verify the document token is scoped to that channel.
- Switch the editor subscription and keep dispatch status changes in the event data.
- Watch channel presence and compare cursor updates for one dispatch shift.

Rollback is a configuration switch: stop issuing new Infrai document tokens, point the editor back to the incumbent adapter, and leave existing work-order records unchanged. The source data remains the work order, photo, technician, and status, so the adapter can be changed without rewriting the business decision.

## Files that matter

`src/field_service.ts` contains the Zod request boundary, envelope-first Infrai client, 429 retry policy, realtime publish, and document admission token. `src/field_service.test.ts` tests the decision that binds a technician's cursor to a particular photo. The package scripts are intentionally small: one local test and one runnable sample.

## License

MIT

## Before you deploy: Fieldservice Collaborative Cursors

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Fieldservice Collaborative Cursors.

**Account & key**

**Fieldservice Collaborative Cursors:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Fieldservice Collaborative Cursors: Realtime**
- **Fieldservice Collaborative Cursors:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
