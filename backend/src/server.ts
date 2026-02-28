import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import aiRoutes from './routes/ai';
import { errorHandler, notFoundHandler } from './utils/errorHandler';

// JS routes (CommonJS)
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const marketsRoutes = require('./routes/markets');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      twitter: !!process.env.TWITTER_BEARER_TOKEN,
      openai: !!process.env.OPENAI_API_KEY
    }
  });
});

// API Routes
app.use('/auth', authRoutes);
app.use('/wallet', walletRoutes);
app.use('/markets', marketsRoutes);
app.use('/ai', aiRoutes);

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 CastAlgo AI Backend running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 AI endpoints: http://localhost:${PORT}/ai/*`);
  
  // Log environment status
  console.log('\n📋 Environment Status:');
  console.log(`   Twitter API: ${process.env.TWITTER_BEARER_TOKEN ? '✅' : '❌'}`);
  console.log(`   OpenAI API: ${process.env.OPENAI_API_KEY ? '✅' : '❌'}`);
  console.log(`   JWT Secret: ${process.env.JWT_SECRET ? '✅' : '❌'}`);
  console.log(`   Node ENV: ${process.env.NODE_ENV || 'development'}`);
});

export default app;