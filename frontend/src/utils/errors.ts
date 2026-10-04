import type { ValidationError } from '../api/datasets';

export type UploadErrorKind = 'invalid-csv' | 'missing-columns' | 'empty-file' | 'unsupported-format' | 'corrupted-data';

export function classifyUploadError(error: unknown): { kind: UploadErrorKind; details: string[] | null } {
  if (error instanceof Error && error.name === 'UnsupportedFormatError') return { kind: 'unsupported-format', details: null };
  if (error instanceof Error && error.name === 'EmptyFileError') return { kind: 'empty-file', details: null };
  if (error instanceof Error && error.name === 'MissingColumnsError') return { kind: 'missing-columns', details: null };
  if (error instanceof Error && error.name === 'CorruptedDataError') return { kind: 'corrupted-data', details: null };
  const validation = error as Partial<ValidationError>;
  const code = validation.code ?? '';
  if (code === 'INVALID_UPLOAD') return { kind: 'unsupported-format', details: null };
  if (code === 'VALIDATION_ERROR') {
    const details = validation.details ?? [];
    const joined = details.join(' ').toLowerCase();
    if (joined.includes('missing required column')) return { kind: 'missing-columns', details };
    if (joined.includes('at least') || joined.includes('header row')) return { kind: 'empty-file', details };
    if (joined.includes('valid date') || joined.includes('finite number') || joined.includes('must be')) return { kind: 'corrupted-data', details };
    return { kind: 'invalid-csv', details };
  }
  return { kind: 'corrupted-data', details: null };
}
