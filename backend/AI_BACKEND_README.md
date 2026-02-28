# CastAlgo AI Backend

AI-powered autonomous prediction market backend using Twitter trends, LangGraph agents, and OpenAI.

## Architecture

```
backend/src/
├── agents/
│   └── marketAgent.ts          # LangGraph orchestration pipeline
├── services/
│   ├── twitter.service.ts      # Twitter API v2 trend scanning
│   ├── trendFilter.service.ts  # Event-based trend filtering
│   ├── marketGenerator.service.ts # LLM market generation
│   ├── probability.service.ts  # AI probability estimation
│   └── advisor.service.ts      # Trading advisory logic
├── routes/
│   └── ai.ts                   # Express API endpoints
├── validation/
│   └── marketValidation.ts     # Market structure validation
└── utils/
    └── errorHandler.ts         # Error handling utilities
```

## API Endpoints

### GET /ai/scan-trends
Scans Twitter for real-time trends and returns filtered, marketable topics.

**Response:**
```json
{
  "success": true,
  "trends": [
    {
      "trend": "#Bitcoin",
      "volume": 125000,
      "category": "crypto",
      "relevanceScore": 85,
      "isEventBased": true
    }
  ],
  "count": 5,
  "timestamp": 1709136000000
}
```

### POST /ai/generate-market
Generates structured prediction markets from trends using LangGraph pipeline.

**Request:**
```json
{
  "trend": "#Bitcoin",      // Optional: specific trend
  "category": "crypto"      // Optional: trend category
}
```

**Response:**
```json
{
  "success": true,
  "market": {
    "question": "Will Bitcoin price increase by 5% in the next 24 hours?",
    "data_source": "CoinGecko API",
    "expiry": "2026-03-01T12:00:00.000Z",
    "ai_probability": 0.65,
    "confidence": "medium",
    "reasoning": "Strong trend momentum with 125k mentions...",
    "suggested_action": "BUY YES"
  },
  "advisory": {
    "mispricing_percentage": 15,
    "advice": "BUY YES",
    "explanation": "AI probability significantly higher than market price"
  }
}
```

### POST /ai/advisory
Analyzes market mispricing and provides trading recommendations.

**Request:**
```json
{
  "ai_probability": 0.65,
  "market_probability": 0.50,
  "market_id": "uuid",
  "question": "Will Bitcoin price increase by 5%?"
}
```

**Response:**
```json
{
  "success": true,
  "advisory": {
    "mispricing_percentage": 15,
    "advice": "BUY YES",
    "explanation": "AI probability (65%) significantly higher than market price (50%)"
  },
  "detailed_analysis": {
    "summary": "BUY YES: Market undervaluing by 15%",
    "risk_assessment": "Medium risk - moderate mispricing detected",
    "confidence_level": "medium",
    "suggested_position_size": "medium"
  }
}
```

### GET /ai/ai-analysis/:market_id
Legacy endpoint for compatibility with existing frontend.

## LangGraph Agent Pipeline

The MarketAgent uses a 6-node pipeline:

1. **scan_trends** - Twitter API trend ingestion
2. **filter_trends** - Event-based filtering
3. **generate_market** - LLM market creation
4. **estimate_probability** - AI probability calculation
5. **validate_market** - Structure validation
6. **analyze_advisory** - Trading recommendation

## Environment Variables

```bash
# AI Services
OPENAI_API_KEY=sk-your-openai-key-here
TWITTER_BEARER_TOKEN=your-twitter-bearer-token-here

# Server
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Security (existing)
JWT_SECRET=your-jwt-secret
WALLET_ENCRYPTION_SECRET=your-encryption-secret
```

## Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Add your API keys to .env
# OPENAI_API_KEY=sk-...
# TWITTER_BEARER_TOKEN=...

# Development mode
npm run dev

# Production build
npm run build
npm start
```

## Market Generation Rules

Every generated market MUST:
- Be binary (YES/NO only)
- Include measurable condition
- Include exact UTC expiry (24-72 hours)
- Include clearly defined data source
- Be objectively resolvable
- Contain no vague wording

## Advisory Logic

Trading advice based on mispricing threshold:
- **Difference > 10%**: Suggest BUY YES/NO
- **Difference ≤ 10%**: Suggest HOLD

## Error Handling

- Twitter API failures → Mock trend data
- OpenAI API failures → Fallback probability estimates
- Validation failures → Structured error responses
- Rate limiting → 429 responses with retry headers

## Integration with Main Backend

The AI backend integrates seamlessly with the existing CastAlgo backend:
- Uses existing JWT authentication
- Follows context.md API contracts
- Returns data compatible with frontend expectations
- Maintains separation of concerns (no blockchain/wallet logic)

## Testing

```bash
# Health check
curl http://localhost:4000/health

# Scan trends
curl -H "Authorization: Bearer <jwt>" http://localhost:4000/ai/scan-trends

# Generate market
curl -X POST -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"trend": "#Bitcoin", "category": "crypto"}' \
  http://localhost:4000/ai/generate-market
```

## Development Notes

- All services are independent and mockable
- LangGraph provides visual pipeline debugging
- TypeScript ensures type safety
- Follows existing backend patterns
- No blockchain logic (as per architecture rules)
- Validates all outputs before returning
- Comprehensive error handling and logging