import type { DatasetListItem } from '../types';

interface Props {
  datasets: DatasetListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function DatasetPicker({ datasets, selectedId, onSelect }: Props) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ fontWeight: 600 }}>Dataset:</label>
      <select
        style={{ width: '100%', padding: '8px', marginTop: '8px' }}
        value={selectedId?.toString() || ''}
        onChange={(e) => {
          const val = parseInt(e.target.value, 10);
          if (!isNaN(val)) onSelect(val);
        }}
      >
        {datasets.map((ds) => (
          <option key={ds.id} value={ds.id.toString()}>
            {ds.name} ({ds.date_range.start_date} - {ds.date_range.end_date}, {ds.row_count} rows)
          </option>
        ))}
      </select>
    </div>
  );
}