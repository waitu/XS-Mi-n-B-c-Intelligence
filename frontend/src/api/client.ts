import type {
  NumberFrequency,
  PredictionResponse,
  RefreshResponse,
  ResultListResponse,
  SummaryStats,
  TailFrequency,
  TailFrequencyGroup,
  BacktestResponse,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';

interface RequestOptions extends RequestInit {
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, headers, ...rest } = options;
  const url = buildUrl(path, query);

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
    ...rest,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || response.statusText);
  }

  return response.json() as Promise<T>;
}

export function getSummary(): Promise<SummaryStats> {
  return request<SummaryStats>('/stats/summary');
}

export function getTailFrequencies(limit = 10): Promise<TailFrequency[]> {
  return request<TailFrequency[]>('/stats/tail-frequencies', { query: { limit } });
}

export interface TailFrequenciesByPrizeOptions {
  limit?: number;
  digits?: number;
  lookback_draws?: number;
}

export function getTailFrequenciesByPrize(options: TailFrequenciesByPrizeOptions = {}): Promise<TailFrequencyGroup[]> {
  const { limit = 5, digits = 2, lookback_draws } = options;
  return request<TailFrequencyGroup[]>('/stats/tail-frequencies/by-prize', {
    query: { limit, digits, lookback_draws },
  });
}

export function getNumberFrequencies(limit = 30): Promise<NumberFrequency[]> {
  return request<NumberFrequency[]>('/stats/frequencies', { query: { limit } });
}

export interface GetResultsOptions {
  limit?: number;
  offset?: number;
  date?: string | null;
}

export function getResults(options: GetResultsOptions = {}): Promise<ResultListResponse> {
  const { limit = 7, offset = 0, date } = options;
  return request<ResultListResponse>('/results', {
    query: { limit, offset, date },
  });
}

export interface PredictionOptions {
  algorithm?: string;
  top_k?: number;
  digits?: number;
  lookback_draws?: number;
  prize_tiers?: string[];
  advanced?: boolean;
  seed?: number;
}

export function getPredictions(options: PredictionOptions = {}): Promise<PredictionResponse> {
  const {
    algorithm = 'frequency',
    top_k = 5,
    digits,
    lookback_draws,
    prize_tiers,
    advanced,
    seed,
  } = options;

  return request<PredictionResponse>('/predictions/heads', {
    query: {
      algorithm,
      top_k,
      digits,
      lookback_draws,
      prize_tiers: prize_tiers?.length ? prize_tiers.join(',') : undefined,
      advanced,
      seed,
    },
  });
}

export interface RefreshOptions {
  start_date?: string;
  end_date?: string;
  force?: boolean;
}

export function refreshData(options: RefreshOptions = {}): Promise<RefreshResponse> {
  return request<RefreshResponse>('/ingest/refresh', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export interface RefreshDayOptions {
  date: string;
  force?: boolean;
}

export function refreshDay(options: RefreshDayOptions): Promise<RefreshResponse> {
  return request<RefreshResponse>('/ingest/day', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export interface RefreshMonthOptions {
  year: number;
  month: number;
  force?: boolean;
}

export function refreshMonth(options: RefreshMonthOptions): Promise<RefreshResponse> {
  return request<RefreshResponse>('/ingest/month', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export interface RefreshYearOptions {
  year: number;
  force?: boolean;
}

export function refreshYear(options: RefreshYearOptions): Promise<RefreshResponse> {
  return request<RefreshResponse>('/ingest/year', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export interface ExportExcelOptions {
  start_date?: string;
  end_date?: string;
}

export async function downloadResultsExcel(
  options: ExportExcelOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  const query: Record<string, string> = {};
  if (options.start_date) {
    query.start_date = options.start_date;
  }
  if (options.end_date) {
    query.end_date = options.end_date;
  }
  const url = buildUrl('/export/excel', query);
  const response = await fetch(url);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || response.statusText || 'Không thể tải Excel');
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const matched = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  let filename = 'xsmb_export.xlsx';
  if (matched) {
    filename = decodeURIComponent(matched[1] ?? matched[2] ?? filename);
  }
  return { blob, filename };
}

export interface BacktestOptions {
  algorithm?: string;
  top_k?: number;
  digits?: number;
  lookback_draws?: number;
  evaluation_draws?: number;
  end_date?: string;
}

export function getBacktestHeads(options: BacktestOptions = {}): Promise<BacktestResponse> {
  const {
    algorithm = 'frequency',
    top_k = 5,
    digits = 2,
    lookback_draws,
    evaluation_draws = 30,
    end_date,
  } = options;

  return request<BacktestResponse>('/analytics/backtest/heads', {
    query: {
      algorithm,
      top_k,
      digits,
      lookback_draws,
      evaluation_draws,
      end_date,
    },
  });
}
