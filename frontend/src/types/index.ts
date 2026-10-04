export interface DatasetListItem {
  id: number;
  name: string;
  date_range: { start_date: string; end_date: string };
  row_count: number;
  created_at: string;
}

export interface PriceSeriesPoint {
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

export interface DatasetMetrics {
  latest_daily_return: number | null;
  annualized_volatility: number | null;
  maximum_drawdown: number;
}

export interface Availability {
  moving_average_20: 'available' | 'insufficient_data';
  moving_average_50: 'available' | 'insufficient_data';
  annualized_volatility: 'available' | 'insufficient_data';
}

export interface DatasetAnalysis {
  dataset: DatasetListItem;
  series: PriceSeriesPoint[];
  metrics: DatasetMetrics;
  availability: Availability;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: string[];
  };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export type AppState =
  | 'loading-datasets'
  | 'loading-analysis'
  | 'uploading'
  | 'ready'
  | 'error'
  | 'empty'
  | 'validation-error';
