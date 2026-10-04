import type { DatasetMetrics, Availability } from '../types';

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

interface Props {
  metrics: DatasetMetrics;
  availability: Availability;
}

export function MetricCards({ metrics, availability }: Props) {
  return (
    <div style={{ display: 'flex', gap: '16px', marginTop: '16px', flexWrap: 'wrap' }}>
      <Card label="Latest Daily Return" value={metrics.latest_daily_return !== null ? pct(metrics.latest_daily_return) : 'N/A'} />
      <Card
        label="Annualized Volatility"
        value={availability.annualized_volatility === 'available' && metrics.annualized_volatility !== null
          ? pct(metrics.annualized_volatility)
          : 'Insufficient data'}
      />
      <Card label="Maximum Drawdown" value={pct(metrics.maximum_drawdown)} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        flex: '1 1 200px',
        border: '1px solid #ddd',
        borderRadius: '8px',
        padding: '16px',
        textAlign: 'center',
        minWidth: '160px',
      }}
    >
      <div style={{ fontSize: '0.85em', color: '#666', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '1.4em', fontWeight: 700 }}>{value}</div>
    </div>
  );
}