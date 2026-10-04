import { motion } from 'framer-motion';

export type StatePanelKind = 'loading' | 'empty' | 'api' | 'invalid-csv' | 'missing-columns' | 'empty-file' | 'unsupported-format' | 'corrupted-data' | 'market-data';

const copy: Record<Exclude<StatePanelKind, 'loading'>, { icon: string; title: string; body: string }> = {
  empty: { icon: '+', title: 'Your workspace is ready', body: 'Upload a market CSV to turn your raw data into a clear analysis.' },
  api: { icon: '↗', title: 'We could not reach the data room', body: 'The service is temporarily unavailable. Check your connection and try again.' },
  'invalid-csv': { icon: '!', title: 'That CSV needs a quick check', body: 'Use a comma-separated file with one header row and at least two data rows.' },
  'missing-columns': { icon: '!', title: 'A few columns are missing', body: 'Your file needs date, open, high, low, close, and volume columns.' },
  'empty-file': { icon: '∅', title: 'This file is empty', body: 'Choose a CSV that contains a header row and market data.' },
  'unsupported-format': { icon: '↥', title: 'Unsupported file format', body: 'Upload a .csv file to continue.' },
  'corrupted-data': { icon: '!', title: 'Some rows could not be read', body: 'Check dates, prices, volume values, and the high/low ranges, then upload again.' },
  'market-data': { icon: '—', title: 'Market data is unavailable', body: 'There is no market snapshot to show right now. Please check back soon.' },
};

interface Props { kind: StatePanelKind; actionLabel?: string; onAction?: () => void; details?: string[] | null; compact?: boolean; }

export function StatePanel({ kind, actionLabel, onAction, details, compact = false }: Props) {
  if (kind === 'loading') {
    return <motion.div className={`state-panel panel ${compact ? 'compact' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}><div className="loading-spinner" /><div className="loading-skeleton-row"><i /><i /><i /></div><h3>Preparing your workspace</h3><p>Fetching the latest analysis context.</p></motion.div>;
  }
  const state = copy[kind];
  return <motion.div className={`state-panel panel ${compact ? 'compact' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><span className="state-icon">{state.icon}</span><h3>{state.title}</h3><p>{state.body}</p>{details && details.length > 0 && <div className="state-details">{details.slice(0, 3).map((detail) => <span key={detail}>{detail}</span>)}</div>}{onAction && <button className="button button-dark state-action" onClick={onAction}>{actionLabel ?? 'Try again'} <span>↗</span></button>}</motion.div>;
}
