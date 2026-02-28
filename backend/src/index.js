require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const marketsRoutes = require('./routes/markets');
// Import TypeScript AI routes (compiled to JS)
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ 
  origin: process.env.FRONTEND_URL || 'http://localhost:3000', 
  credentials: true 
}));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/markets', marketsRoutes);
app.use('/ai', aiRoutes);

// Health check with AI service status
app.get('/health', (_req, res) => {
  res.json({ 
    status: 'ok', 
    project: 'CastAlgo',
    timestamp: new Date().toISOString(),
    services: {
      twitter: !!process.env.TWITTER_BEARER_TOKEN,
      openai: !!process.env.OPENAI_API_KEY,
      jwt: !!process.env.JWT_SECRET
    }
  });
});

// ── 404 / Error handlers ──────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 CastAlgo backend running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 AI endpoints: http://localhost:${PORT}/ai/*`);
  
  // Log AI service status
  console.log('\n📋 AI Services Status:');
  console.log(`   Twitter API: ${process.env.TWITTER_BEARER_TOKEN ? '✅' : '❌'}`);
  console.log(`   OpenAI API: ${process.env.OPENAI_API_KEY ? '✅' : '❌'}`);
});
