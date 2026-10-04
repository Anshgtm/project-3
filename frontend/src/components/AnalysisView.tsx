import type { DatasetAnalysis } from '../types';
import { PriceChart } from './PriceChart';
import { MetricCards } from './MetricCards';
import type { AppState } from '../types';

interface Props {
  analysis: DatasetAnalysis | null;
  state: AppState;
}

export function AnalysisView({ analysis, state }: Props) {
  if (state === 'loading-analysis') {
    return <div style={{ textAlign: 'center', padding: '32px' }}>Loading analysis...</div>;
  }

  if (state === 'error') {
    return (
      <div style={{ textAlign: 'center', padding: '32px', color: '#d32f2f' }}>
        Analysis could not be loaded. Please try again.
      </div>
    );
  }

  if (state === 'empty' || !analysis) {
    return <div style={{ textAlign: 'center', padding: '32px', color: '#666' }}>No dataset selected.</div>;
  }

  const ds = analysis.dataset;

  return (
    <div>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>{ds.name}</h2>
        <div style={{ color: '#666', fontSize: '0.9em' }}>
          {ds.date_range.start_date} - {ds.date_range.end_date}  |  {ds.row_count} rows
        </div>
      </div>

      <PriceChart series={analysis.series} availability={analysis.availability} />
      <MetricCards metrics={analysis.metrics} availability={analysis.availability} />
    </div>
  );
}