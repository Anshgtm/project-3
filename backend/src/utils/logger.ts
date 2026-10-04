type LogValue = unknown;

function serialize(value: LogValue) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return '[unserializable]'; }
}

function write(level: 'INFO' | 'ERROR', message: string, values: LogValue[]) {
  const suffix = values.length ? ` ${values.map(serialize).join(' ')}` : '';
  process.stderr.write(`${new Date().toISOString()} ${level} ${message}${suffix}\n`);
}

export const logger = {
  info: (message: string, ...values: LogValue[]) => write('INFO', message, values),
  error: (message: string, ...values: LogValue[]) => write('ERROR', message, values),
};
