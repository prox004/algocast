/**
 * tickerExtraction.service.ts — Extract stock/crypto tickers from market questions
 * Identifies ticker symbols and asset types from prediction market questions
 */

export interface TickerInfo {
  ticker: string;
  assetType: 'stock' | 'crypto' | 'commodity' | null;
  symbol: string;
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

export class TickerExtractionService {
  // Common stock tickers
  private readonly STOCK_TICKERS = new Set([
    'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'V',
    'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'DIS', 'PYPL', 'ADBE', 'CSCO',
    'INTC', 'AMD', 'CRM', 'ORCL', 'IBM', 'BA', 'CAT', 'GE', 'F', 'GM',
    'T', 'VZ', 'PFE', 'JNJ', 'MRK', 'ABBV', 'AMGN', 'LLY', 'REGN', 'VRTX',
    'AXP', 'BLK', 'BX', 'GS', 'MS', 'BK', 'C', 'WFC', 'USB', 'PNC',
    'SPY', 'QQQ', 'IWM', 'DIA', 'EEM', 'EFA', 'AGG', 'TLT', 'GLD', 'SLV',
    'USO', 'XLE', 'XLY', 'XLP', 'XLI', 'XLK', 'XLV', 'XLRE', 'XLU', 'GUSH',
  ]);

  // Common crypto tickers
  private readonly CRYPTO_TICKERS = new Set([
    'BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'LINK', 'XRP', 'DOGE', 'SHIB', 'MATIC',
    'AVAX', 'FTM', 'NEAR', 'ATOM', 'ARB', 'OP', 'MANA', 'SAND', 'GALA', 'ENJ',
    'FLOW', 'VGX', 'CHZ', 'RUNE', 'GMT', 'NFT', 'JST', 'WOO', 'LINA', 'LUNA',
    'ALGO', 'ANKR', 'APE', 'ASTR', 'BETA', 'CAP', 'CRV', 'DYP', 'ELF', 'ETHW',
    'FIL', 'GFI', 'GMT', 'GRT', 'GT', 'HBAR', 'HOPT', 'IOTX', 'IRIS', 'KAVA',
    'KLAY', 'KSM', 'LDO', 'LPT', 'LRC', 'LSK', 'LUNA', 'MAGIC', 'MINA', 'OKB',
    'PAXG', 'PYR', 'RDNT', 'REEF', 'RSR', 'SEI', 'SHIB', 'SNAPE', 'STG', 'STX',
    'SUSHI', 'SYN', 'THETA', 'TIME', 'TON', 'TRX', 'TUSD', 'UNI', 'VET', 'WAVES',
    'WMATIC', 'XDC', 'XMR', 'XVS', 'YFI', 'ZEC', 'ZIL', 'ZRX',
  ]);

  // Stock ticker patterns
  private readonly STOCK_PATTERNS = [
    /\$([A-Z]{1,5})(?:\s|$|[,.!?])/gi,  // $AAPL
    /\b([A-Z]{1,5})\s+(stock|share|share price|earnings|revenue|IPO)/gi, // AAPL stock
    /\b(Apple|Microsoft|Google|Amazon|Tesla|Meta|Nvidia|JP Morgan|Visa|Mastercard)\b/gi, // Company names
  ];

  // Crypto patterns
  private readonly CRYPTO_PATTERNS = [
    /\$(BTC|ETH|XRP|SOL|ADA|DOGE|SHIB|LINK)\b/gi,  // $BTC
    /\b(Bitcoin|Ethereum|Solana|Cardano|XRP|Dogecoin|Shiba|Chainlink)\b/gi, // Crypto names
    /\b([A-Z]{2,5})\s+(cryptocurrency|crypto|coin|token|blockchain)\b/gi, // Generic crypto
  ];

  // Company name to ticker mapping
  private readonly COMPANY_TO_TICKER: Record<string, string> = {
    'apple': 'AAPL',
    'microsoft': 'MSFT',
    'google': 'GOOGL',
    'amazon': 'AMZN',
    'tesla': 'TSLA',
    'meta': 'META',
    'nvidia': 'NVDA',
    'jp morgan': 'JPM',
    'jpmorgan': 'JPM',
    'visa': 'V',
    'mastercard': 'MA',
    'united': 'UNH',
    'home depot': 'HD',
    'disney': 'DIS',
    'paypal': 'PYPL',
    'adobe': 'ADBE',
    'cisco': 'CSCO',
    'intel': 'INTC',
    'amd': 'AMD',
    'pfizer': 'PFE',
    'johnson': 'JNJ',
    'merck': 'MRK',
    'eli lilly': 'LLY',
    'berkshire': 'BRK',
    'marriott': 'MAR',
    'hilton': 'HLT',
    'bank of america': 'BAC',
    'wells fargo': 'WFC',
    'goldman': 'GS',
  };

  // Crypto name to ticker mapping
  private readonly CRYPTO_TO_TICKER: Record<string, string> = {
    'bitcoin': 'BTC',
    'ethereum': 'ETH',
    'solana': 'SOL',
    'cardano': 'ADA',
    'ripple': 'XRP',
    'xrp': 'XRP',
    'dogecoin': 'DOGE',
    'doge': 'DOGE',
    'shiba': 'SHIB',
    'chainlink': 'LINK',
    'link': 'LINK',
    'polkadot': 'DOT',
    'dot': 'DOT',
    'avalanche': 'AVAX',
    'avax': 'AVAX',
    'polygon': 'MATIC',
    'matic': 'MATIC',
    'fantom': 'FTM',
    'ftm': 'FTM',
    'near': 'NEAR',
    'cosmos': 'ATOM',
    'arbitrum': 'ARB',
    'optimism': 'OP',
    'algorand': 'ALGO',
    'algo': 'ALGO',
    'uniswap': 'UNI',
    'aave': 'AAVE',
    'lido': 'LDO',
    'gmx': 'GMX',
  };

  /**
   * Extract ticker information from a market question
   * Returns highest confidence match or null
   */
  extractTicker(question: string): TickerInfo | null {
    // Try direct ticker extraction
    let result = this.extractDirectTicker(question);
    if (result) return result;

    // Try company/crypto name extraction
    result = this.extractFromName(question);
    if (result) return result;

    // Try pattern-based extraction
    result = this.extractFromPatterns(question);
    return result;
  }

  /**
   * Extract if ticker is directly mentioned as $TICKER
   */
  private extractDirectTicker(question: string): TickerInfo | null {
    const regex = /\$([A-Z]{1,5})\b/g;
    const match = regex.exec(question);

    if (!match) return null;

    const ticker = match[1].toUpperCase();

    // Check if it's a known stock or crypto
    if (this.STOCK_TICKERS.has(ticker)) {
      return {
        ticker,
        assetType: 'stock',
        symbol: ticker,
        confidence: 'high',
        notes: `Direct stock ticker: $${ticker}`,
      };
    }

    if (this.CRYPTO_TICKERS.has(ticker)) {
      return {
        ticker,
        assetType: 'crypto',
        symbol: ticker,
        confidence: 'high',
        notes: `Direct crypto ticker: $${ticker}`,
      };
    }

    // Unknown ticker - assume based on length and context
    return {
      ticker,
      assetType: null,
      symbol: ticker,
      confidence: 'low',
      notes: 'Ticker extracted but not in known database',
    };
  }

  /**
   * Extract based on company or crypto names
   */
  private extractFromName(question: string): TickerInfo | null {
    const lowerQuestion = question.toLowerCase();

    // Check company names
    for (const [company, ticker] of Object.entries(this.COMPANY_TO_TICKER)) {
      if (lowerQuestion.includes(company)) {
        return {
          ticker,
          assetType: 'stock',
          symbol: ticker,
          confidence: question.toLowerCase().includes('stock') ? 'high' : 'medium',
          notes: `Extracted from company name: ${company}`,
        };
      }
    }

    // Check crypto names
    for (const [cryptoName, ticker] of Object.entries(this.CRYPTO_TO_TICKER)) {
      if (lowerQuestion.includes(cryptoName)) {
        return {
          ticker,
          assetType: 'crypto',
          symbol: ticker,
          confidence: question.toLowerCase().includes('crypto') ? 'high' : 'medium',
          notes: `Extracted from crypto name: ${cryptoName}`,
        };
      }
    }

    return null;
  }

  /**
   * Extract based on question patterns
   */
  private extractFromPatterns(question: string): TickerInfo | null {
    // Check for stock patterns
    const stockKeywords = ['price', 'stock', 'share', 'earnings', 'revenue', 'ipo', 'dollar', '$'];
    const hasStockKeyword = stockKeywords.some(kw => question.toLowerCase().includes(kw));

    // Check for crypto patterns
    const cryptoKeywords = [
      'crypto',
      'bitcoin',
      'ethereum',
      'blockchain',
      'coin',
      'token',
      'algo',
      'algorand',
    ];
    const hasCryptoKeyword = cryptoKeywords.some(kw => question.toLowerCase().includes(kw));

    // Extract word that looks like a ticker
    const tickerRegex = /\b([A-Z]{1,5})\b/g;
    let match;
    while ((match = tickerRegex.exec(question)) !== null) {
      const potentialTicker = match[1];

      // Skip common words
      if (['WILL', 'FOR', 'THE', 'AND', 'REACH', 'BY', 'THAN', 'DOES', 'PRICE'].includes(potentialTicker)) {
        continue;
      }

      // If we have context, make a guess
      if (hasStockKeyword && this.STOCK_TICKERS.has(potentialTicker)) {
        return {
          ticker: potentialTicker,
          assetType: 'stock',
          symbol: potentialTicker,
          confidence: 'high',
          notes: 'Extracted from context and known stock database',
        };
      }

      if (hasCryptoKeyword && this.CRYPTO_TICKERS.has(potentialTicker)) {
        return {
          ticker: potentialTicker,
          assetType: 'crypto',
          symbol: potentialTicker,
          confidence: 'high',
          notes: 'Extracted from context and known crypto database',
        };
      }
    }

    return null;
  }

  /**
   * Determine if a question is likely about stocks or crypto
   */
  classifyAssetType(question: string): 'stock' | 'crypto' | 'other' {
    const lowerQuestion = question.toLowerCase();

    const cryptoIndicators = ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'algo', 'coin', 'token'];
    const stockIndicators = [
      'stock',
      'price',
      'earnings',
      'revenue',
      'ipo',
      'share',
      'company',
      'market cap',
    ];

    const cryptoScore = cryptoIndicators.filter(ind => lowerQuestion.includes(ind)).length;
    const stockScore = stockIndicators.filter(ind => lowerQuestion.includes(ind)).length;

    if (cryptoScore > stockScore) {
      return 'crypto';
    } else if (stockScore > 0) {
      return 'stock';
    }
    return 'other';
  }

  /**
   * Extract all possible tickers from question (not just the best match)
   */
  extractAllTickers(question: string): TickerInfo[] {
    const tickers: TickerInfo[] = [];
    const seen = new Set<string>();

    // Direct ticker extraction
    const directRegex = /\$([A-Z]{1,5})\b/g;
    let match;
    while ((match = directRegex.exec(question)) !== null) {
      const ticker = match[1].toUpperCase();
      if (!seen.has(ticker)) {
        seen.add(ticker);
        if (this.STOCK_TICKERS.has(ticker)) {
          tickers.push({
            ticker,
            assetType: 'stock',
            symbol: ticker,
            confidence: 'high',
          });
        } else if (this.CRYPTO_TICKERS.has(ticker)) {
          tickers.push({
            ticker,
            assetType: 'crypto',
            symbol: ticker,
            confidence: 'high',
          });
        }
      }
    }

    return tickers;
  }
}

export const tickerExtractionService = new TickerExtractionService();
