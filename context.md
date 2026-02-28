# CastAlgo — Single Source of Truth

> Last updated: 2026-02-28 (Unified: AI + Contracts + Backend)
> All architecture, API contracts, DB schemas, smart contract specs, and integration rules live here.
> Every code change MUST align with this document.
> No module may introduce structural changes without updating this file.

---

# Project Overview

**CastAlgo** is an AI-powered autonomous prediction market protocol built on **Algorand TestNet**.

Core Flow:

1. AI scans trends (mock data for hackathon)
2. AI generates structured YES/NO market with probability
3. Backend creates market record
4. Smart contract deployed per market (ARC-4 PyTeal)
5. Users buy YES/NO tokens (custodial wallet model)
6. Market resolves
7. Users claim winnings
8. Users withdraw real ALGO

System uses:

- Custodial wallet model
- AES-256 encrypted private keys
- PyTeal ARC-4 smart contracts
- In-memory DB (hackathon)
- OpenAI (or mock) for AI probability

---

# Repository Structure

```
AlgoCast/
├── context.md                  ← THIS FILE (single source of truth)

├── contracts/                  ← Dev A (Smart Contracts Layer)
│   ├── app.py
│   ├── market_logic.py
│   ├── asa_utils.py
│   ├── wallet_manager.ts
│   ├── deploy.py
│   └── config.py

├── backend/                    ← Node.js + Express
│   ├── src/
│   │   ├── index.js
│   │   ├── db.js
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

└── frontend/                   ← Dev C (Next.js 14)
    ├── app/
    │   ├── page.tsx
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
    │   └── api.ts
    ├── .env.local.example
    └── package.json
```

---

# Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, TypeScript, Tailwind |
| Backend | Node.js 20, Express 4 |
| Blockchain | Algorand TestNet |
| Smart Contract | PyTeal ARC-4 ABI |
| Wallet Signing | algosdk (JS) |
| Auth | JWT |
| Encryption | AES-256-CBC |
| DB | In-memory JS store |
| AI | OpenAI GPT-4o (or mock) |

---

# Team Responsibilities

| Dev | Owns |
|-----|------|
| Dev A | Smart contracts, ASA creation, buy/claim/resolve logic, custodial signing, withdraw |
| Dev B | AI engine, trend scanning (mock), OpenAI integration |
| Dev C | Frontend UI, Next.js pages, components |

---

# Custodial Wallet Model

## On Registration

1. Generate Algorand keypair
2. Encrypt private key using AES-256-CBC
3. Store:
   - custodial_address
   - encrypted_private_key
4. Never return private key to frontend

---

## Encryption Scheme

```
algorithm : aes-256-cbc
key       : sha256(WALLET_ENCRYPTION_SECRET)
iv        : random 16 bytes
stored as : "<iv_hex>:<ciphertext_hex>"
```

Rules:

- Decrypt only inside transaction functions
- Never log decrypted keys
- WALLET_ENCRYPTION_SECRET stored in .env only

---

# Database Schema (In-Memory)

## Users

```js
{
  id: string,
  email: string,
  hashed_password: string,
  custodial_address: string,
  encrypted_private_key: string,
  balance: number
}
```

## Markets

```js
{
  id: string,
  question: string,
  expiry: number,
  ai_probability: number,
  yes_asa_id: number | null,
  no_asa_id: number | null,
  yes_reserve: number,
  no_reserve: number,
  resolved: boolean,
  outcome: 0 | 1 | null
}
```

## Trades

```js
{
  id: string,
  user_id: string,
  market_id: string,
  side: 'YES' | 'NO',
  amount: number,
  tokens: number,
  timestamp: number
}
```

## Claims

```js
{
  id: string,
  user_id: string,
  market_id: string,
  claimed_at: number
}
```

---

# API Contract

Base URL:
```
http://localhost:4000
```

All protected routes require:
```
Authorization: Bearer <jwt_token>
```

---

# AUTH

## POST /register

Request:
```json
{ "email": "string", "password": "string" }
```

Response:
```json
{ "token": "jwt", "user": { "id", "email", "custodial_address", "balance" } }
```

## POST /login

Same response structure.

---

# WALLET

## POST /deposit (protected)

Request:
```json
{ "amount": number }
```

Response:
```json
{ "success": true, "balance": number }
```

(Hackathon: directly credits balance.)

---

## POST /withdraw (protected)

Request:
```json
{ "to_address": "string", "amount": number }
```

Rules:
- amount ≤ balance
- deduct before broadcasting

---

# MARKETS

## GET /markets

Returns all markets with computed:

```
market_probability = yes_reserve / (yes_reserve + no_reserve)
```

---

## POST /generate-market (protected)

Request:
```json
{ "question": "string", "expiry": number }
```

Creates market record.

---

## POST /buy-yes (protected)

Rules:
- amount > 0
- not expired
- not resolved
- balance ≥ amount
- tokens = amount (1:1 hackathon simplification)

Same shape for `/buy-no`.

---

## POST /claim (protected)

Rules:
- market resolved
- user owns winning tokens
- no prior claim

---

## POST /resolve (protected)

Request:
```json
{ "market_id": "string", "outcome": 0 | 1 }
```

---

# Smart Contract (Dev A)

Each market = one ARC-4 app.

Global State:

```
question
close_ts
yes_asa_id
no_asa_id
yes_reserve
no_reserve
resolved
outcome
creator
```

---

# ABI Methods

| Method | Args |
|--------|------|
| create_market | question, close_ts |
| buy_yes | payment txn |
| buy_no | payment txn |
| resolve_market | outcome |
| claim | — |
| withdraw | amount |

---

# Pricing Model

```
Probability(YES) = yes_reserve / (yes_reserve + no_reserve)
tokens_issued = amount (1:1)
```

---

# AI Engine (Dev B)

Hackathon rule:
Real Twitter API NOT required.
Mock trend data allowed.

AI Responsibilities:

- Generate binary YES/NO markets
- Assign ai_probability (0–1)
- Provide reasoning
- No blockchain calls

---

# AI Market Rules

Every AI-generated market MUST:

- Be binary
- Include measurable condition
- Include exact UTC expiry
- Include objective data source
- Be resolvable
- No vague wording

---

# Security Rules

- AES-256 encryption mandatory
- Validate numeric inputs
- Prevent double claim
- Prevent withdrawal above balance
- Disable buy when expired or resolved

---

# Frontend Integration Rules

1. All calls via `frontend/lib/api.ts`
2. JWT in localStorage as `castalgo_token`
3. Never expose encrypted_private_key
4. Amounts always microAlgos
5. Display probability as `(value * 100).toFixed(1)%`

---

# Hackathon Scope

DO build:
- Custodial wallet
- Deposit + withdraw
- Market create + buy + resolve + claim
- AI probability endpoint
- Clean UI
- Deploy PyTeal to TestNet

DO NOT build:
- On-chain AMM
- Decentralized oracle
- Dispute system
- Real Twitter ingestion