import getDb from '../config/database.js';
import type { DatasetDoc, DatasetListItem, DateInfo, SampleRow } from '../models/types.js';

export async function getNextSeq(db: any, name: string): Promise<number> {
  const result = await db.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
}

async function getDateInfo(db: any, datasetId: number): Promise<DateInfo> {
  const pipeline = [
    { $match: { dataset_id: datasetId } },
    { $group: { _id: null, start_date: { $min: '$trading_date' }, end_date: { $max: '$trading_date' }, row_count: { $sum: 1 } } }
  ];
  const result = await db.collection('daily_price_rows').aggregate(pipeline).toArray();
  if (result.length === 0) {
    return { start_date: '', end_date: '', row_count: 0 };
  }
  return result[0];
}

export async function buildDatasetListItem(db: any, row: DatasetDoc): Promise<DatasetListItem> {
  const info = await getDateInfo(db, row._id);
  return {
    id: row._id,
    name: row.name,
    date_range: { start_date: info.start_date, end_date: info.end_date },
    row_count: info.row_count,
    created_at: row.created_at,
  };
}

export function generateSampleData(): SampleRow[] {
  const rows: SampleRow[] = [];
  let price = 148.25;
  const today = new Date();
  let dayCount = 0;

  for (let offset = 365; offset >= 0 && rows.length < 252; offset--) {
    const d = new Date(today.getTime() - offset * 86400000);
    if (d.getDay() === 0 || d.getDay() === 6) continue;

    dayCount++;
    const dr = Math.sin(dayCount * 0.15) * 0.012 + Math.cos(dayCount * 0.07) * 0.008;
    price = Math.max(1.0, price * (1 + dr));
    const open = price * (0.997 + Math.sin(dayCount * 0.1) * 0.003);
    const spread = 0.006 + Math.abs(Math.sin(dayCount * 0.2)) * 0.014;
    const high = Math.max(open, price) * (1 + spread);
    const low = Math.min(open, price) * (1 - spread);
    const vol = Math.floor(800000 + Math.sin(dayCount * 0.05) * 1500000 + 1500000);

    rows.push({
      trading_date: d.toISOString().split('T')[0],
      open_price: Math.round(open * 100) / 100,
      high_price: Math.round(high * 100) / 100,
      low_price: Math.round(low * 100) / 100,
      close_price: Math.round(price * 100) / 100,
      volume: Math.max(1, Math.round(vol)),
    });
  }
  return rows;
}

export async function generateSampleDataset(db: any): Promise<DatasetDoc> {
  const rows = generateSampleData();
  const now = new Date().toISOString();
  const dsId = await getNextSeq(db, 'dataset_id');

  await db.collection('datasets').insertOne({ _id: dsId, name: 'Built-in Sample Dataset', created_at: now });
  await db.collection('daily_price_rows').insertMany(
    rows.map(r => ({
      dataset_id: dsId,
      trading_date: r.trading_date,
      open_price: r.open_price,
      high_price: r.high_price,
      low_price: r.low_price,
      close_price: r.close_price,
      volume: r.volume,
      created_at: now,
    }))
  );

  return { _id: dsId, name: 'Built-in Sample Dataset', created_at: now };
}