const BASE_URL = import.meta.env.VITE_BASE_BE_ENDPOINT as string;

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  imageUrl: string | null;
  source: string;
  publishedAt: string;
  sentiment: number | null;
  symbols: string[];
}

export async function getNews(symbols?: string) {
  const query = symbols ? `?symbols=${encodeURIComponent(symbols)}` : '';
  const response = await fetch(`${BASE_URL}/api/news${query}`, { headers: { Accept: 'application/json' } });
  const body = await response.json() as { articles?: NewsArticle[]; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? 'Market news is unavailable.');
  return body.articles ?? [];
}
