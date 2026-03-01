// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import session from 'express-session';
import aiRoutes from './routes/ai';
import dbMarketsRoutes from './routes/markets'; // New TypeScript DB routes
import adminAuthRoutes from './routes/adminAuth';
import adminRoutes from './routes/admin';
import disputeRoutes from './routes/dispute';
import { errorHandler, notFoundHandler } from './utils/errorHandler';
import { getAutoMarketGeneratorService } from './services/autoMarketGenerator.service';
import { startUmaScheduler } from './services/uma.service';

// JS routes (CommonJS)
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const legacyMarketsRoutes = require('./routes/markets.js'); // Old JS routes for trading
const { seedMarkets } = require('./seed');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://192.168.17.1:3000',
      'http://192.168.17.1:3001',
      process.env.FRONTEND_URL
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for development
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session middleware (required for passport)
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Initialize Passport (if configured)
try {
  const passport = require('./config/passport').default;
  app.use(passport.initialize());
  app.use(passport.session());
  console.log('✅ Passport OAuth initialized');
} catch (err) {
  console.warn('⚠️  Passport not configured - OAuth routes disabled');
  console.warn('   Error:', err instanceof Error ? err.message : String(err));
}

// Health check endpoint
app.get('/health', (req, res) => {
  const hasTwitterAPI = !!(process.env.TWITTER_BEARER_TOKEN || process.env.RAPIDAPI_KEY);
  const hasAI = !!(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY);
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      twitter: hasTwitterAPI,
      openai: hasAI
    },
    mode: {
      twitter: hasTwitterAPI ? 'REAL DATA' : 'NO API KEY - DISABLED',
      ai: hasAI ? 'REAL AI' : 'NO API KEY - DISABLED',
      database: 'ENABLED (SQLite)',
      mockData: 'DISABLED - REAL DATA ONLY'
    },
    warning: !hasTwitterAPI || !hasAI ? 'Some services are disabled. Check .env configuration.' : null
  });
});

// API Routes
app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/markets/db', dbMarketsRoutes); // New database query routes
app.use('/markets', legacyMarketsRoutes); // Legacy trading routes
app.use('/ai', aiRoutes);
app.use('/admin', adminAuthRoutes);       // Admin authentication (login)
app.use('/admin', adminRoutes);           // Admin governance (resolution, disputes)
app.use('/dispute', disputeRoutes);       // User dispute flagging

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start AI market auto-generation
const autoGen = getAutoMarketGeneratorService();
autoGen.start();

// Start UMA Protocol scheduler (processes expired dispute windows & voting periods)
startUmaScheduler();

// Start server
app.listen(PORT, () => {
  // Seed curated markets into the in-memory DB before serving traffic
  seedMarkets();

  console.log(`🚀 CastAlgo AI Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 AI endpoints: http://localhost:${PORT}/ai/*`);
  console.log(`🎯 Auto Market Gen: Enabled (interval: ${process.env.AUTO_MARKET_GEN_INTERVAL_MIN || 5} min)`);
  console.log(`⚖️  UMA Protocol: Enabled (dispute: 10min, voting: 10min, no bonds)`);
  
  // Log environment status
  const network = (process.env.ALGORAND_NETWORK || 'testnet').toLowerCase();
  const isLocalNet = network === 'local' || network === 'localnet';
  
  console.log('\n📋 Environment Status:');
  console.log(`   Network: ${isLocalNet ? '🌐 LocalNet (http://localhost:4001)' : '🌍 TestNet'}`);
  console.log(`   Custodial Wallet: ✅ (auto-funded on registration)`);
  console.log(`   Twitter API: ${process.env.TWITTER_BEARER_TOKEN ? '✅' : '❌'}`);
  console.log(`   AI API: ${(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY) ? '✅' : '❌'}`);
  console.log(`   JWT Secret: ${process.env.JWT_SECRET ? '✅' : '❌'}`);
  console.log(`   Node ENV: ${process.env.NODE_ENV || 'development'}`);
  
  if (process.env.OPENROUTER_API_KEY) {
    console.log(`   Using: OpenRouter (Llama 3.1)`);
  } else if (process.env.OPENAI_API_KEY) {
    console.log(`   Using: OpenAI GPT-4`);
  }
  
  if (isLocalNet) {
    console.log('\n💡 Tip: To view LocalNet accounts, run: algokit localnet console');
    console.log('         Then in the console: goal account list');
  }
});

export default app;