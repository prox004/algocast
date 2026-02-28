import express, { Request, Response } from 'express';
import { getDatabase } from '../services/database.service';

const router = express.Router();

/**
 * GET /api/markets
 * Get all markets with optional filtering
 * Query params:
 *   - status: 'active' | 'closed' | 'resolved'
 *   - category: string
 *   - tweet_author: string
 *   - search: string (full-text search)
 *   - limit: number (default 100)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { status, category, tweet_author, search, limit } = req.query;

    const markets = db.getMarkets(
      {
        status: status as any,
        category: category as string,
        tweet_author: tweet_author as string,
        search: search as string
      },
      limit ? parseInt(limit as string) : 100
    );

    res.json({
      success: true,
      count: markets.length,
      markets
    });
  } catch (error) {
    console.error('Error fetching markets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch markets'
    });
  }
});

/**
 * GET /api/markets/active
 * Get only active markets (not expired, not resolved)
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const markets = db.getActiveMarkets();

    res.json({
      success: true,
      count: markets.length,
      markets
    });
  } catch (error) {
    console.error('Error fetching active markets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active markets'
    });
  }
});

/**
 * GET /api/markets/expired
 * Get markets that have expired but not yet resolved
 */
router.get('/expired', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const markets = db.getExpiredMarkets();

    res.json({
      success: true,
      count: markets.length,
      markets
    });
  } catch (error) {
    console.error('Error fetching expired markets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch expired markets'
    });
  }
});

/**
 * GET /api/markets/search/:term
 * Full-text search for markets
 */
router.get('/search/:term', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { term } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const markets = db.searchMarkets(term, limit);

    res.json({
      success: true,
      count: markets.length,
      query: term,
      markets
    });
  } catch (error) {
    console.error('Error searching markets:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search markets'
    });
  }
});

/**
 * GET /api/markets/stats
 * Get database statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const stats = db.getStats();

    // Also check for expired markets that need auto-closing
    const closedCount = db.autoCloseExpiredMarkets();

    res.json({
      success: true,
      stats,
      auto_closed_markets: closedCount
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    });
  }
});

/**
 * GET /api/markets/:id
 * Get a specific market by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    
    const market = db.getMarketById(id);

    if (!market) {
      res.status(404).json({
        success: false,
        error: 'Market not found'
      });
      return;
    }

    res.json({
      success: true,
      market
    });
  } catch (error) {
    console.error('Error fetching market:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch market'
    });
  }
});

/**
 * PUT /api/markets/:id/resolve
 * Resolve a market with a result
 * Body: { result: 'yes' | 'no' }
 */
router.put('/:id/resolve', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const { id } = req.params;
    const { result } = req.body;

    if (!result || (result !== 'yes' && result !== 'no')) {
      res.status(400).json({
        success: false,
        error: 'Result must be either "yes" or "no"'
      });
      return;
    }

    const market = db.getMarketById(id);
    if (!market) {
      res.status(404).json({
        success: false,
        error: 'Market not found'
      });
      return;
    }

    db.updateMarketStatus(id, 'resolved', result);

    res.json({
      success: true,
      message: `Market ${id} resolved as ${result.toUpperCase()}`
    });
  } catch (error) {
    console.error('Error resolving market:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve market'
    });
  }
});

/**
 * PUT /api/markets/:id/close
 * Manually close a market without resolving
 */
router.put('/:id/close', async (req: Request, res: Response): Promise<void> => {
  try {
    const db = getDatabase();
    const { id } = req.params;

    const market = db.getMarketById(id);
    if (!market) {
      res.status(404).json({
        success: false,
        error: 'Market not found'
      });
      return;
    }

    db.updateMarketStatus(id, 'closed');

    res.json({
      success: true,
      message: `Market ${id} closed`
    });
  } catch (error) {
    console.error('Error closing market:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to close market'
    });
  }
});

export default router;
