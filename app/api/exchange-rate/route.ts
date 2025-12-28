import { NextResponse } from "next/server";
import { getExchangeRateForDate } from "@/lib/utils/currency";

/**
 * GET /api/exchange-rate?from=USD&to=EUR&date=2024-01-15
 * Fetches exchange rate between two currencies for a specific date
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fromCurrency = searchParams.get("from");
  const toCurrency = searchParams.get("to");
  const date = searchParams.get("date");

  if (!fromCurrency || !toCurrency) {
    return NextResponse.json(
      { error: "from and to currency codes are required" },
      { status: 400 }
    );
  }

  try {
    // Use provided date or default to today
    const exchangeDate = date || new Date().toISOString().split("T")[0];
    const rate = await getExchangeRateForDate(fromCurrency, toCurrency, exchangeDate);

    return NextResponse.json({
      from: fromCurrency,
      to: toCurrency,
      date: exchangeDate,
      rate,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch exchange rate" },
      { status: 500 }
    );
  }
}

