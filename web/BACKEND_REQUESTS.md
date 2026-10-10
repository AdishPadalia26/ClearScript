# Backend requests from `web/`

Things the console needs from the API (Codex / Person 1) that aren't in the shared contract, or that
the contract leaves ambiguous. Nothing here is required for the UI to run against mocks.

## Needed for live mode

1. **CORS** for the console origin on every endpoint, including `GET /faxes/{id}/pages/{n}.png`.
   The page image is loaded with `crossOrigin="anonymous"` so the drawer can crop it on a
   `<canvas>`; without `Access-Control-Allow-Origin` the crops fail (the overlays still work).
   Alternatively, populate `Read.crop_url` and the client uses that instead.

2. **WebSocket `/ws/orders`** should send `order.updated` after every resolve/decision/approve,
   and `call.updated` on every call status or transcript change. The console patches its caches
   from these; while the socket is down it polls every 3 s.

3. **Error body shape.** The client reads `{ error: string, message?: string }` from non-2xx
   responses (falls back to FastAPI's `{ detail }`). The 409 on approve must stay
   `{ error: "red_fields", fields: string[] }`.

## Optional (UI degrades gracefully without them)

4. **Call preview** — `GET /orders/{id}/fields/{field}/call/preview` →
   `{ to_number, number_source, question }`. The pre-call confirm card must show who we'll call and
   the exact question _before_ dialing, but `POST …/call` already dials. Today the card shows the
   fax-header number and a client-side question built by `lib/order.ts#callQuestion`, which mirrors
   the mock agent. If the real agent phrases it differently, this endpoint makes the card exact.

5. **Cancel a call** — `POST /calls/{id}/cancel` → `Call`. The panel would show a Cancel button
   while `queued | dialing | in_progress`.

6. **Operating threshold in metrics** — `Metrics.operating_threshold?: number`. The tradeoff chart
   currently infers it as the curve point nearest ClearScript's reported flag/silent-error rates.

7. **Pharmacist identity** — `Resolution.user` is optional; once auth exists, set it so the audit
   trail and the "Resolved by" tag can name the pharmacist.
