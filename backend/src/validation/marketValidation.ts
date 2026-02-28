interface MarketData {
  question: string;
  data_source: string;
  expiry: string;
  ai_probability: number;
  confidence?: string;
  reasoning?: string;
  suggested_action?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class MarketValidator {
  private readonly BINARY_INDICATORS = [
    'will', 'does', 'is', 'can', 'should', 'has', 'would', 'could'
  ];

  private readonly RELIABLE_SOURCES = [
    'twitter api', 'official website', 'news api', 'exchange api',
    'government data', 'financial api', 'sports api', 'weather api'
  ];

  validate(market: MarketData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Question validation
    this.validateQuestion(market.question, errors, warnings);
    
    // Data source validation
    this.validateDataSource(market.data_source, errors, warnings);
    
    // Expiry validation
    this.validateExpiry(market.expiry, errors, warnings);
    
    // Probability validation
    this.validateProbability(market.ai_probability, errors, warnings);
    
    // Confidence validation
    if (market.confidence) {
      this.validateConfidence(market.confidence, errors, warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private validateQuestion(question: string, errors: string[], warnings: string[]): void {
    if (!question || typeof question !== 'string') {
      errors.push('Question is required and must be a string');
      return;
    }

    if (question.length < 10) {
      errors.push('Question must be at least 10 characters long');
    }

    if (question.length > 200) {
      warnings.push('Question is very long, consider shortening for clarity');
    }

    // Check if question is binary
    const lowerQuestion = question.toLowerCase();
    const isBinary = this.BINARY_INDICATORS.some(indicator => 
      lowerQuestion.startsWith(indicator)
    ) || question.endsWith('?');

    if (!isBinary) {
      warnings.push('Question may not be clearly binary (YES/NO)');
    }

    // Check for vague terms
    const vagueTerms = ['might', 'maybe', 'possibly', 'probably', 'likely'];
    const hasVagueTerms = vagueTerms.some(term => lowerQuestion.includes(term));
    
    if (hasVagueTerms) {
      warnings.push('Question contains vague terms that may affect resolvability');
    }

    // Check for measurable conditions
    const measurableIndicators = ['%', 'percent', 'number', 'amount', 'price', 'date', 'time'];
    const hasMeasurable = measurableIndicators.some(indicator => 
      lowerQuestion.includes(indicator)
    );

    if (!hasMeasurable) {
      warnings.push('Question may lack measurable conditions for objective resolution');
    }
  }

  private validateDataSource(dataSource: string, errors: string[], warnings: string[]): void {
    if (!dataSource || typeof dataSource !== 'string') {
      errors.push('Data source is required and must be a string');
      return;
    }

    if (dataSource.length < 5) {
      errors.push('Data source must be at least 5 characters long');
    }

    // Check if data source is reliable
    const lowerSource = dataSource.toLowerCase();
    const isReliable = this.RELIABLE_SOURCES.some(source => 
      lowerSource.includes(source)
    );

    if (!isReliable) {
      warnings.push('Data source may not be from a reliable/verifiable source');
    }

    // Check for specific API endpoints or official sources
    if (!lowerSource.includes('api') && !lowerSource.includes('official')) {
      warnings.push('Consider specifying an API endpoint or official source for better verification');
    }
  }

  private validateExpiry(expiry: string, errors: string[], warnings: string[]): void {
    if (!expiry) {
      errors.push('Expiry is required');
      return;
    }

    // Handle both string and number formats
    let expiryDate: Date;
    if (typeof expiry === 'number') {
      // If it's a number, it could be Unix seconds or milliseconds
      // Unix timestamps are typically between 1.6B - 1.7B (seconds), milliseconds would be 1e12+
      const ms = expiry > 1e11 ? expiry : expiry * 1000;
      expiryDate = new Date(ms);
    } else if (typeof expiry === 'string') {
      expiryDate = new Date(expiry);
    } else {
      errors.push('Expiry must be a string or number');
      return;
    }

    const now = new Date();

    if (isNaN(expiryDate.getTime())) {
      errors.push('Expiry must be a valid ISO date string or Unix timestamp');
      return;
    }

    if (expiryDate <= now) {
      errors.push('Expiry must be in the future');
    }

    // Check if expiry is too far in the future
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    if (expiryDate.getTime() - now.getTime() > oneYear) {
      warnings.push('Expiry is more than one year in the future, consider shorter timeframe');
    }

    // Check if expiry is too soon
    const oneHour = 60 * 60 * 1000;
    if (expiryDate.getTime() - now.getTime() < oneHour) {
      warnings.push('Expiry is less than one hour away, may not allow sufficient trading time');
    }
  }

  private validateProbability(probability: number, errors: string[], warnings: string[]): void {
    if (typeof probability !== 'number') {
      errors.push('AI probability must be a number');
      return;
    }

    if (probability < 0 || probability > 1) {
      errors.push('AI probability must be between 0 and 1');
    }

    // Check for extreme probabilities
    if (probability < 0.05 || probability > 0.95) {
      warnings.push('Extreme probability values may indicate low market interest');
    }

    // Check for exactly 0.5 (may indicate lack of analysis)
    if (probability === 0.5) {
      warnings.push('Probability of exactly 50% may indicate insufficient analysis');
    }
  }

  private validateConfidence(confidence: string, errors: string[], warnings: string[]): void {
    const validConfidenceLevels = ['low', 'medium', 'high'];
    
    if (!validConfidenceLevels.includes(confidence.toLowerCase())) {
      errors.push('Confidence must be one of: low, medium, high');
    }

    if (confidence.toLowerCase() === 'low') {
      warnings.push('Low confidence estimate may not be suitable for trading');
    }
  }

  validateAdvisoryInput(aiProbability: number, marketProbability: number): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof aiProbability !== 'number' || typeof marketProbability !== 'number') {
      errors.push('Both AI probability and market probability must be numbers');
    }

    if (aiProbability < 0 || aiProbability > 1) {
      errors.push('AI probability must be between 0 and 1');
    }

    if (marketProbability < 0 || marketProbability > 1) {
      errors.push('Market probability must be between 0 and 1');
    }

    // Check for identical probabilities
    if (Math.abs(aiProbability - marketProbability) < 0.001) {
      warnings.push('AI and market probabilities are nearly identical');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  sanitizeMarketData(market: MarketData): MarketData {
    return {
      question: this.sanitizeString(market.question),
      data_source: this.sanitizeString(market.data_source),
      expiry: market.expiry,
      ai_probability: Math.max(0, Math.min(1, market.ai_probability)),
      confidence: market.confidence?.toLowerCase() as 'low' | 'medium' | 'high',
      reasoning: market.reasoning ? this.sanitizeString(market.reasoning) : undefined,
      suggested_action: market.suggested_action
    };
  }

  private sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') return '';
    
    return input
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s\-.,!?()%$]/g, '') // Remove special characters except common punctuation
      .substring(0, 500); // Limit length
  }
}