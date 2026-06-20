# 🎰 Lucky Spin Casino (mock gambling site)

A **standalone** mock gambling website where Mock Bank customers spend their money. It is built as
a **separate company**: its own React frontend, its own Express + SQLite backend, its own user
accounts and chip wallet. It never touches the bank's database — it integrates with the bank purely
over HTTP, exactly like a real merchant ↔ issuer relationship.

Players can fund their chip wallet two ways:

1. **Swipe a bank card** — enter a Mock Bank–issued card; we authorize + capture it through the
   bank's card-acceptance ("Network") API using our partner API key.
2. **Connect their bank account** — link their account via the bank's Plaid-style Connect flow
   (using the [`@mockbank/connect`](https://github.com/george-garcia/connect-sdk) SDK), then pull
   funds with ACH-style transfers.

…then play a provably-fair coin-flip / dice game and **cash out** back to the bank.

## Architecture

```
web/    React + Vite (port 5180)  ──/api proxy──▶  server/  Express + SQLite (port 4100)
                                                       │  partner API key / access tokens
                                                       ▼
                                            Mock Bank  http://localhost:3000/api
web/  (Connect popup) ───────────────▶  Mock Bank hosted page  http://localhost:5173/connect
```

## Run it

Prerequisite: the **Mock Bank** must be running and seeded (so the partner key + demo card exist):

```bash
cd ../mock-bank && pnpm install && docker-compose up -d && pnpm db:migrate && pnpm db:seed && pnpm dev
```

Then start the casino:

```bash
cp .env.example server/.env      # optional; sensible defaults are built in
npm install                      # installs server + web; fetches & builds @mockbank/connect from GitHub
npm run dev                      # API on :4100, web on :5180
```

> The casino depends on [`@mockbank/connect`](https://github.com/george-garcia/connect-sdk) via a
> GitHub URL, so `npm install` fetches and builds it automatically. Once the SDK is published to
> npm, swap `web/package.json` to `"@mockbank/connect": "^0.1.0"`.

Open http://localhost:5180, create a casino account, then **Add funds**:

- **Pay with card:** `4111 1111 1111 1111` · exp `12 / 2030` · CVV `123` (the bank's seeded card for Alice).
- **Connect bank:** sign in to the bank as `alice@example.com` / `password123`, pick checking, approve.

## API (backend)

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register \| login \| logout`, `GET /api/me` | Casino accounts (separate from the bank) |
| `GET /api/wallet` | Chip balance + ledger |
| `POST /api/fund/card` | Authorize + capture a bank card → credit wallet |
| `POST /api/connect/link-token` | Start a bank Connect session |
| `POST /api/connect/exchange` | Exchange the public token for an access token (grant) |
| `POST /api/fund/connect` | ACH-pull from the linked account → credit wallet |
| `POST /api/cashout` | Refund the card or ACH-credit the linked account |
| `POST /api/play` | Provably-fair coin-flip / dice |
| `GET /api/bets` | Bet history |

All bank secrets (partner API key, Connect access tokens) live only on the **backend**.
