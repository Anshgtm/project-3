import { type Request, type Response } from 'express';
import multer from 'multer';
import getDb from '../config/database.js';
import * as csvParser from '../services/csv.js';
import { computeAnalysis } from '../services/analysis.js';
import { buildDatasetListItem, generateSampleDataset, getNextSeq } from '../services/dataset.js';
import type { DatasetDoc, PriceRow } from '../models/types.js';
import { logger } from '../utils/logger.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

export async function listDatasets(_req: Request, res: Response) {
  try {
    const db = getDb();
    let datasetRows = await db.collection('datasets').find().sort({ _id: 1 }).toArray() as unknown as DatasetDoc[];

    if (datasetRows.length === 0) {
      try {
        const sample = await generateSampleDataset(db);
        datasetRows = [sample];
      } catch (initErr) {
        logger.error('Sample initialization failed', initErr);
        res.status(500).json({ error: { code: 'SAMPLE_UNAVAILABLE', message: 'Could not initialize the built-in sample dataset' } });
        return;
      }
    }

    const items = await Promise.all(datasetRows.map(r => buildDatasetListItem(db, r)));
    res.json({ datasets: items });
  } catch (err) {
    logger.error('GET /api/datasets error', err);
    if (!res.headersSent) res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
  }
}

export function uploadDataset(req: Request, res: Response) {
  const middleware = upload.single('file');
  middleware(req, res, async (uploadErr: unknown) => {
    if (uploadErr) {
      const msg = uploadErr instanceof Error ? uploadErr.message : 'Upload failed';
      res.status(400).json({ error: { code: 'INVALID_UPLOAD', message: msg } });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: { code: 'INVALID_UPLOAD', message: 'No file provided' } });
      return;
    }

    const filename = req.file.originalname.toLowerCase();
    if (!filename.endsWith('.csv') || !['text/csv', 'application/csv', 'application/vnd.ms-excel', ''].includes(req.file.mimetype)) {
      res.status(415).json({ error: { code: 'UNSUPPORTED_FORMAT', message: 'Only CSV files are supported.' } });
      return;
    }
    if (req.file.size === 0) {
      res.status(422).json({ error: { code: 'EMPTY_FILE', message: 'The uploaded CSV is empty.' } });
      return;
    }

    const csvText = req.file.buffer.toString('utf-8');
    const parsed = csvParser.parseCSV(csvText);
    if (parsed.error) {
      res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error, details: [parsed.error] } });
      return;
    }

    const allErrors: string[] = [];
    for (const row of parsed.rows!) {
      const rowErrors = csvParser.validateRow(row);
      if (rowErrors) {
        allErrors.push(...rowErrors);
      }
    }

    const dateSet = new Set<string>();
    for (const row of parsed.rows!) {
      if (dateSet.has(row.date)) {
        allErrors.push(`Duplicate date "${row.date}" found in CSV`);
      }
      dateSet.add(row.date);
    }

    if (allErrors.length > 0) {
      res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'CSV validation failed', details: allErrors } });
      return;
    }

    parsed.rows!.sort((a, b) => a.date.localeCompare(b.date));

    try {
      const db = getDb();
      const now = new Date().toISOString();
      const rawName = req.file.originalname!;
      const name = rawName ? rawName.replace(/\.[^.]+$/, '') : 'Uploaded Dataset';
      const datasetName = name.length > 0 ? name : 'Uploaded Dataset';

      const dsId = await getNextSeq(db, 'dataset_id');
      await db.collection('datasets').insertOne({ _id: dsId, name: datasetName, created_at: now } as any);
      await db.collection('daily_price_rows').insertMany(
        parsed.rows!.map(r => {
          const mapped = csvParser.mapRowToDB(r);
          return { dataset_id: dsId, ...mapped, created_at: now };
        })
      );

      const newDataset: DatasetDoc = { _id: dsId, name: datasetName, created_at: now };
      const item = await buildDatasetListItem(db, newDataset);
      res.status(201).json({ dataset: item });
    } catch (dbErr) {
      logger.error('POST /api/datasets db error', dbErr);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Database error during dataset creation' } });
    }
  });
}

export async function getDatasetAnalysis(req: Request, res: Response) {
  try {
    const db = getDb();
    const rawId = req.params.id;
    const dsId = Number(rawId);
    if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(dsId) || dsId < 1) {
      res.status(404).json({ error: { code: 'DATASET_NOT_FOUND', message: 'Invalid dataset id' } });
      return;
    }

    const dsRow = await db.collection('datasets').findOne({ _id: dsId } as any) as DatasetDoc | null;
    if (!dsRow) {
      res.status(404).json({ error: { code: 'DATASET_NOT_FOUND', message: `Dataset ${dsId} not found` } });
      return;
    }

    const priceRows = await db.collection('daily_price_rows')
      .find({ dataset_id: dsId } as any)
      .sort({ trading_date: 1 })
      .toArray() as unknown as PriceRow[];

    if (priceRows.length === 0) {
      res.status(500).json({ error: { code: 'ANALYSIS_UNAVAILABLE', message: 'Dataset has no price rows' } });
      return;
    }

    const result = computeAnalysis(priceRows);
    const datasetItem = await buildDatasetListItem(db, dsRow);

    res.json({
      dataset: datasetItem,
      series: result.series,
      metrics: result.metrics,
      availability: result.availability,
    });
  } catch (err) {
    logger.error('GET /api/datasets/:id error', err);
    if (!res.headersSent) res.status(500).json({ error: { code: 'ANALYSIS_UNAVAILABLE', message: 'Could not compute analysis' } });
  }
}
