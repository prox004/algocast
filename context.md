# CastAlgo — Single Source of Truth

> Last updated: 2026-02-28
> All architecture, API contracts, DB schemas, and integration rules live here.
> Every code change MUST align with this document.

---

## Project Overview

**CastAlgo** is an AI-powered autonomous prediction market protocol built on Algorand TestNet.

- Detects Twitter trends → creates YES/NO prediction markets
- Deploys markets on Algorand using ASA tokens
- Uses a **custodial wallet system** (backend controls private keys)
- Users buy YES/NO tokens, redeem winnings, and withdraw ALGO
- AI module provides probability estimates per market

---

## Repository Structure

```
AlgoCast/
├── context.md                  ← this file (single source of truth)
├── backend/                    ← Node.js + Express
│   ├── src/
│   │   ├── index.js            ← entry point
│   │   ├── db.js               ← in-memory DB (hackathon)
│   │   ├── wallet/
│   │   │   └── custodialWallet.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── wallet.js
│   │   │   ├── markets.js
│   │   │   └── ai.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   └── algorand/
│   │       ├── client.js
│   │       └── asa.js
│   ├── .env.example
│   └── package.json
└── frontend/                   ← Next.js App Router
    ├── app/
    │   ├── page.tsx            ← / (market dashboard)
    │   ├── market/[id]/page.tsx
    │   ├── login/page.tsx
    │   └── wallet/page.tsx
    ├── components/
    │   ├── MarketCard.tsx
    │   ├── BuyPanel.tsx
    │   ├── AIInsightPanel.tsx
    │   ├── WalletBalance.tsx
    │   └── WithdrawForm.tsx
    ├── lib/
    │   └── api.ts              ← all fetch calls to backend
    ├── .env.local.example
    └── package.json
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Node.js 20, Express 4 |
| Blockchain | Algorand TestNet, algosdk |
| Auth | JWT (jsonwebtoken) |
| Encryption | AES-256-CBC (Node crypto) |
| DB | In-memory JS store (hackathon) |
| AI | OpenAI API (gpt-4o) or mock |

---

## Custodial Wallet Model

### On Registration
1. Backend generates Algorand keypair (`algosdk.generateAccount()`)
2. Private key → encrypted with AES-256 using `WALLET_ENCRYPTION_SECRET`
3. `{ custodial_address, encrypted_private_key }` stored in user record
4. Plain private key NEVER persisted or returned to frontend

### Rules
- `encrypted_private_key` is NEVER sent to frontend
- Decryption only happens inside transaction execution functions
- All txns signed server-side

### Encryption scheme
```
algorithm : aes-256-cbc
key       : sha256(WALLET_ENCRYPTION_SECRET)  → 32 bytes
iv        : random 16 bytes, prepended to ciphertext (hex:hex)
stored as : "<iv_hex>:<ciphertext_hex>"
```

---

## Database Schema (In-Memory)

### Users
```js
{
  id: string (uuid),
  email: string,
  hashed_password: string (bcrypt),
  custodial_address: string,
  encrypted_private_key: string,
  balance: number  // ALGO balance in microAlgos
}
```

### Markets
```js
{
  id: string (uuid),
  question: string,
  expiry: number,        // unix timestamp
  ai_probability: number, // 0-1
  yes_asa_id: number | null,
  no_asa_id: number | null,
  yes_reserve: number,
  no_reserve: number,
  resolved: boolean,
  outcome: 0 | 1 | null  // 0=NO wins, 1=YES wins
}
```

### Trades
```js
{
  id: string (uuid),
  user_id: string,
  market_id: string,
  side: 'YES' | 'NO',
  amount: number,   // microAlgos spent
  tokens: number,   // tokens received
  timestamp: number
}
```

### Claims
```js
{
  id: string (uuid),
  user_id: string,
  market_id: string,
  claimed_at: number
}
```

---

## API Contract

### Base URL
- Development: `http://localhost:4000`

### Auth Headers
All protected routes require:
```
Authorization: Bearer <jwt_token>
```

---

### AUTH

#### POST /register
Request:
```json
{ "email": "string", "password": "string" }
```
Response:
```json
{ "token": "jwt", "user": { "id", "email", "custodial_address", "balance" } }
```

#### POST /login
Request:
```json
{ "email": "string", "password": "string" }
```
Response:
```json
{ "token": "jwt", "user": { "id", "email", "custodial_address", "balance" } }
```

---

### WALLET

#### POST /deposit  *(protected)*
Request:
```json
{ "amount": number }  // microAlgos
```
Response:
```json
{ "success": true, "balance": number }
```
Note: For hackathon, this directly credits balance (no real on-chain deposit required in demo mode).

#### POST /withdraw  *(protected)*
Request:
```json
{ "to_address": "string", "amount": number }
```
Response:
```json
{ "success": true, "txid": "string", "balance": number }
```
Rules:
- amount ≤ user.balance
- Deduct balance BEFORE broadcasting txn

---

### MARKETS

#### GET /markets
Response:
```json
[
  {
    "id", "question", "expiry", "ai_probability",
    "yes_asa_id", "no_asa_id",
    "yes_reserve", "no_reserve",
    "resolved", "outcome",
    "market_probability": number  // yes_reserve / (yes_reserve + no_reserve)
  }
]
```

#### POST /generate-market  *(protected)*
Request:
```json
{ "question": "string", "expiry": number }
```
Response:
```json
{ "market": { ...market object } }
```
Note: Creates market record + (in hackathon) mocks ASA IDs.

#### POST /buy-yes  *(protected)*
Request:
```json
{ "market_id": "string", "amount": number }
```
Response:
```json
{ "success": true, "tokens": number, "trade": { ...trade object } }
```
Rules:
- amount > 0
- market not resolved
- market not expired
- user.balance >= amount
- tokens = amount (1:1 for simplicity in hackathon)

#### POST /buy-no  *(protected)*
Same shape as buy-yes.

#### POST /claim  *(protected)*
Request:
```json
{ "market_id": "string" }
```
Response:
```json
{ "success": true, "payout": number }
```
Rules:
- market.resolved === true
- user has winning-side tokens
- no prior claim for (user_id, market_id)

#### POST /resolve  *(protected, admin only in prod — open for hackathon)*
Request:
```json
{ "market_id": "string", "outcome": 0 | 1 }
```
Response:
```json
{ "success": true }
```

---

### AI

#### GET /ai-analysis/:market_id
Response:
```json
{
  "market_id": "string",
  "ai_probability": number,
  "summary": "string",
  "sentiment": "BULLISH" | "BEARISH" | "NEUTRAL"
}
```

---

## Frontend ↔ Backend Integration Rules

1. All API calls go through `frontend/lib/api.ts`
2. JWT stored in `localStorage` under key `castalgo_token`
3. Frontend never receives or stores `encrypted_private_key`
4. Amount fields always in **microAlgos** (integer)
5. Probability displayed as percentage: `(value * 100).toFixed(1)%`
6. Market expired = `Date.now() / 1000 > market.expiry`

---

## Algorand Notes

- Network: **TestNet**
- Algod endpoint: `https://testnet-api.algonode.cloud` (free, no key needed)
- Indexer: `https://testnet-idx.algonode.cloud`
- Minimum balance: 0.1 ALGO per account + 0.1 per ASA opted-in
- For hackathon: ASA creation mocked; real on-chain txns for withdraw only

---

## Security Rules

- AES-256-CBC encrypt all private keys at rest
- `WALLET_ENCRYPTION_SECRET` ≥ 32 chars, stored in `.env` only
- JWT secret: `JWT_SECRET` in `.env`
- Never log private keys or decrypted keys
- Validate all numeric inputs (positive, integer)
- Prevent double claims via Claims table lookup
- Prevent withdrawal above balance (check before deduct)
- Disable buy routes when `market.resolved || market.expiry < Date.now()/1000`

---

## Hackathon Priorities

**DO build:**
- Custodial wallet create + encrypt
- Deposit (mock credit) + Withdraw (real txn)
- Market create + buy + resolve + claim
- AI probability endpoint (GPT or mock)
- Clean frontend UI

**DO NOT build:**
- On-chain AMM
- Decentralized oracle
- Dispute system
- Real Twitter API (mock trend data is fine)
