import type { PriceRow, SeriesPoint, Metrics, Availability, AnalysisResult } from '../models/types.js';

function computeAnalysis(rows: PriceRow[]): AnalysisResult {
  const closePrefix = new Array<number>(rows.length + 1).fill(0);
  for (let i = 0; i < rows.length; i++) {
    closePrefix[i + 1] = closePrefix[i] + rows[i].close_price;
  }

  const series: SeriesPoint[] = rows.map((r, i) => {
    const prevClose = i > 0 ? rows[i - 1].close_price : null;
    const dailyReturn = prevClose !== null ? (r.close_price - prevClose) / prevClose : null;

    let ma20: number | null = null;
    if (i >= 19) {
      ma20 = (closePrefix[i + 1] - closePrefix[i - 19]) / 20;
    }

    let ma50: number | null = null;
    if (i >= 49) {
      ma50 = (closePrefix[i + 1] - closePrefix[i - 49]) / 50;
    }

    return {
      date: r.trading_date,
      open: r.open_price,
      high: r.high_price,
      low: r.low_price,
      close: r.close_price,
      volume: r.volume,
      daily_return: dailyReturn,
      moving_average_20: ma20,
      moving_average_50: ma50,
    };
  });

  const returns = series.map(s => s.daily_return).filter(r => r !== null);

  let annualizedVolatility: number | null = null;
  let volAvailability: 'available' | 'insufficient_data' = 'insufficient_data';
  if (returns.length >= 2) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
    annualizedVolatility = Math.sqrt(variance) * Math.sqrt(252);
    volAvailability = 'available';
  }

  let peak = rows[0].close_price;
  let maxDrawdown = 0;
  for (const r of rows) {
    peak = Math.max(peak, r.close_price);
    const dd = (r.close_price - peak) / peak;
    maxDrawdown = Math.min(maxDrawdown, dd);
  }

  const metrics: Metrics = {
    latest_daily_return: returns.length > 0 ? returns[returns.length - 1] : null,
    annualized_volatility: annualizedVolatility,
    maximum_drawdown: maxDrawdown,
  };

  const availability: Availability = {
    moving_average_20: rows.length >= 20 ? 'available' : 'insufficient_data' as const,
    moving_average_50: rows.length >= 50 ? 'available' : 'insufficient_data' as const,
    annualized_volatility: volAvailability,
  };

  return { series, metrics, availability };
}

export { computeAnalysis };
