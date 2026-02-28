# CastAlgo

> AI-powered autonomous prediction market protocol on Algorand TestNet.

See [context.md](./context.md) for the full architecture, API contracts, and DB schemas.

---

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env     # fill in secrets
npm install
npm run dev              # http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev              # http://localhost:3000
```

---

## Folder Structure

```
AlgoCast/
├── context.md            ← single source of truth
├── backend/
│   └── src/
│       ├── index.js
│       ├── db.js                  ← in-memory DB
│       ├── wallet/
│       │   └── custodialWallet.js ← AES key management
│       ├── algorand/
│       │   ├── client.js          ← algod client
│       │   └── asa.js             ← ASA + ALGO transfer
│       ├── routes/
│       │   ├── auth.js
│       │   ├── wallet.js
│       │   ├── markets.js
│       │   └── ai.js
│       └── middleware/
│           └── auth.js
└── frontend/
    ├── app/
    │   ├── page.tsx               ← / market dashboard
    │   ├── market/[id]/page.tsx   ← market detail
    │   ├── login/page.tsx
    │   └── wallet/page.tsx
    ├── components/
    │   ├── MarketCard.tsx
    │   ├── BuyPanel.tsx
    │   ├── AIInsightPanel.tsx
    │   ├── WalletBalance.tsx
    │   └── WithdrawForm.tsx
    └── lib/
        └── api.ts                 ← all fetch calls
```

---

## API Routes (Backend)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | — | Register + create custodial wallet |
| POST | /auth/login | — | Login |
| POST | /wallet/deposit | ✓ | Credit balance (mock) |
| POST | /wallet/withdraw | ✓ | Real on-chain ALGO send |
| GET | /markets | — | List all markets |
| GET | /markets/:id | — | Get single market |
| POST | /markets/generate | ✓ | Create market |
| POST | /markets/buy-yes | ✓ | Buy YES tokens |
| POST | /markets/buy-no | ✓ | Buy NO tokens |
| POST | /markets/claim | ✓ | Claim winnings |
| POST | /markets/resolve | ✓ | Resolve market |
| GET | /ai/analysis/:id | — | AI probability + summary |

---

## Architecture Notes

- **Custodial wallets**: backend generates Algorand keypairs, encrypts with AES-256-CBC, stores encrypted key in DB. Plain key never exposed.
- **Deposits**: mocked credit for hackathon (no real txn needed to demo buying).
- **Withdrawals**: real Algorand TestNet transactions signed server-side.
- **ASA tokens**: mocked IDs for hackathon. YES/NO token accounting is in-memory.
- **AI**: uses GPT-4o if `OPENAI_API_KEY` set, else returns deterministic mock data.

---

## Hackathon

Built at hackathon 2026. Priority: stability & demo quality over complexity.
