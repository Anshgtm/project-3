import type { DatasetListItem, DatasetAnalysis, ErrorEnvelope } from '../types';
import { getAccessToken } from './auth';

const BASE_URL = import.meta.env.VITE_BASE_BE_ENDPOINT as string;

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ValidationError extends Error {
  code: string;
  details: string[] | null;

  constructor(code: string, message: string, details: string[] | null) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.details = details;
  }
}

export async function listDatasets(): Promise<{ datasets: DatasetListItem[] }> {
  const res = await fetch(`${BASE_URL}/api/datasets`, {
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  if (!res.ok) {
    const body: ErrorEnvelope = await res.json();
    throw new Error(body.error.message);
  }
  return res.json();
}

export async function uploadDataset(
  file: File
): Promise<{ dataset: DatasetListItem }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE_URL}/api/datasets`, {
    method: 'POST',
    headers: { Accept: 'application/json', ...authHeaders() },
    body: formData,
  });
  if (!res.ok) {
    const body: ErrorEnvelope = await res.json();
    throw new ValidationError(body.error.code, body.error.message, body.error.details || null);
  }
  return res.json();
}

export async function getDatasetAnalysis(id: number): Promise<DatasetAnalysis> {
  const res = await fetch(`${BASE_URL}/api/datasets/${id}`, {
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  if (!res.ok) {
    const body: ErrorEnvelope = await res.json();
    throw new Error(body.error.message);
  }
  return res.json();
}
