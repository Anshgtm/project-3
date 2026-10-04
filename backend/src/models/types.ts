export interface PriceRow {
  trading_date: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number;
}

export interface DatasetDoc {
  _id: number;
  name: string;
  created_at: string;
}

export interface DateInfo {
  start_date: string;
  end_date: string;
  row_count: number;
}

export interface DatasetListItem {
  id: number;
  name: string;
  date_range: { start_date: string; end_date: string };
  row_count: number;
  created_at: string;
}

export interface SampleRow {
  trading_date: string;
  open_price: number;
  high_price: number;
  low_price: number;
  close_price: number;
  volume: number;
}

export interface SeriesPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  daily_return: number | null;
  moving_average_20: number | null;
  moving_average_50: number | null;
}

export interface Metrics {
  latest_daily_return: number | null;
  annualized_volatility: number | null;
  maximum_drawdown: number;
}

export interface Availability {
  moving_average_20: 'available' | 'insufficient_data';
  moving_average_50: 'available' | 'insufficient_data';
  annualized_volatility: 'available' | 'insufficient_data';
}

export interface AnalysisResult {
  series: SeriesPoint[];
  metrics: Metrics;
  availability: Availability;
}