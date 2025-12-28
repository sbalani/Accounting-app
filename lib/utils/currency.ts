// Currency utilities and exchange rate fetching

/**
 * List of supported currency codes (ISO 4217)
 */
export const SUPPORTED_CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY",
  "INR", "BRL", "MXN", "SGD", "HKD", "NZD", "ZAR", "SEK",
  "NOK", "DKK", "PLN", "CZK", "HUF", "ILS", "TRY", "RUB",
  "KRW", "THB", "MYR", "PHP", "IDR", "VND", "AED", "SAR",
] as const;

export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

/**
 * Format amount with currency symbol
 */
export function formatCurrency(
  amount: number,
  currency: string = "USD",
  locale: string = "en-US"
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
  }).format(amount);
}

/**
 * Fetch exchange rate from external API
 * Uses exchangerate-api.com free tier (no API key needed for base USD)
 * For production, consider using a more reliable API like fixer.io or exchangerate-api.com paid tier
 */
export async function fetchExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  date?: string // YYYY-MM-DD format, defaults to today
): Promise<number> {
  // Same currency, return 1
  if (fromCurrency === toCurrency) {
    return 1;
  }

  try {
    // Use exchangerate-api.com free tier
    // The free tier uses a simple endpoint structure
    if (date) {
      // For historical dates, try the historical endpoint (may not be available in free tier)
      // Fallback to latest if historical fails
      const url = `https://api.exchangerate-api.com/v4/historical/${fromCurrency}/${date}`;
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          const rate = data.rates?.[toCurrency];
          if (rate) {
            return rate;
          }
        }
      } catch (e) {
        // Historical endpoint may not work, fall through to latest
      }
    }
    
    // Use latest rates (free tier)
    // Note: Free tier may not support historical dates, so we use latest available
    const url = `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch exchange rate: ${response.statusText}`);
    }

    const data = await response.json();
    const rate = data.rates?.[toCurrency];
    if (!rate) {
      throw new Error(`Exchange rate not found for ${toCurrency}`);
    }
    return rate;
  } catch (error: any) {
    console.error("Error fetching exchange rate:", error);
    
    // Fallback: try alternative API (fixer.io style) if available
    // For now, throw the error and let the caller handle it
    throw new Error(
      `Failed to fetch exchange rate from ${fromCurrency} to ${toCurrency}: ${error.message}`
    );
  }
}

/**
 * Convert amount from one currency to another using exchange rate
 */
export function convertAmount(
  amount: number,
  exchangeRate: number
): number {
  return amount * exchangeRate;
}

/**
 * Get exchange rate with caching/fallback logic
 * For past dates, uses the latest available rate for that day
 */
export async function getExchangeRateForDate(
  fromCurrency: string,
  toCurrency: string,
  date: string // YYYY-MM-DD format
): Promise<number> {
  try {
    // Try to fetch rate for the exact date
    return await fetchExchangeRate(fromCurrency, toCurrency, date);
  } catch (error) {
    // If that fails, try the latest rate (for today's transactions)
    // or try previous dates (for past transactions)
    const transactionDate = new Date(date);
    const today = new Date();
    
    if (transactionDate.toDateString() === today.toDateString()) {
      // For today, use latest rate
      try {
        return await fetchExchangeRate(fromCurrency, toCurrency);
      } catch (fallbackError) {
        throw new Error(
          `Failed to fetch exchange rate: ${(fallbackError as Error).message}`
        );
      }
    } else {
      // For past dates, try a few previous days to find the latest available rate
      // This handles weekends/holidays when markets are closed
      for (let daysBack = 0; daysBack < 7; daysBack++) {
        const tryDate = new Date(transactionDate);
        tryDate.setDate(tryDate.getDate() - daysBack);
        const tryDateStr = tryDate.toISOString().split("T")[0];
        
        try {
          return await fetchExchangeRate(fromCurrency, toCurrency, tryDateStr);
        } catch (e) {
          // Continue to next day
          continue;
        }
      }
      
      // If all else fails, throw error
      throw new Error(
        `Could not find exchange rate for ${fromCurrency} to ${toCurrency} around ${date}`
      );
    }
  }
}

