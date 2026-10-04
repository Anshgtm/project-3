import {
  LineChart, Line, XAxis, YAxis, Legend, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import type { PriceSeriesPoint, Availability } from '../types';

interface Props {
  series: PriceSeriesPoint[];
  availability: Availability;
}

export function PriceChart({ series, availability }: Props) {
  const chartData = series.map((s) => ({
    date: s.date,
    close: s.close,
    ma20: s.moving_average_20,
    ma50: s.moving_average_50,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 16, right: 24, left: 8, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="close" name="Close" stroke="#2563eb" dot={false} />
          {availability.moving_average_20 === 'available' && (
            <Line type="monotone" dataKey="ma20" name="20-day MA" stroke="#16a34a" dot={false} connectNulls />
          )}
          {availability.moving_average_50 === 'available' && (
            <Line type="monotone" dataKey="ma50" name="50-day MA" stroke="#d97706" dot={false} connectNulls />
          )}
        </LineChart>
      </ResponsiveContainer>
      <div style={{ fontSize: '0.85em', color: '#666', marginTop: '8px' }}>
        {availability.moving_average_20 === 'insufficient_data' && (
          <div>20-day moving average: insufficient data (need at least 20 rows)</div>
        )}
        {availability.moving_average_50 === 'insufficient_data' && (
          <div>50-day moving average: insufficient data (need at least 50 rows)</div>
        )}
      </div>
    </div>
  );
}
