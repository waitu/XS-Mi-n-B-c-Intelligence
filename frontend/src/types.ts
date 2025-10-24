export interface Prize {
  prize_name: string;
  prize_rank: number;
  number: string;
  position: number;
}

export interface Draw {
  draw_date: string;
  region: string;
  source_url?: string | null;
  prizes: Prize[];
}

export interface ResultListResponse {
  total: number;
  limit: number;
  offset: number;
  items: Draw[];
}

export interface SummaryStats {
  total_draws: number;
  last_updated: string | null;
  prizes_per_rank: Record<string, number>;
}

export interface TailFrequency {
  tail: string;
  count: number;
}

export interface NumberFrequency {
  number: string;
  count: number;
}

export interface PredictionSupportingMetrics {
  [key: string]: string | number | boolean | null | undefined;
}

export interface PredictionResult {
  number: string;
  probability: number;
  rank: number;
  supporting_metrics?: PredictionSupportingMetrics;
  explanation?: string;
}

export interface PredictionMetadata {
  lookback_draws?: number;
  digits?: number;
  runtime_ms?: number;
  confidence_score?: number;
  notes?: string;
  advanced?: boolean;
  top_k?: number;
  [key: string]: string | number | boolean | null | undefined;
}

export interface PredictionRelated {
  hot_numbers?: string[];
  cold_numbers?: string[];
  heatmap_slice?: Record<string, number>;
  pseudo_code?: string;
  [key: string]: unknown;
}

export interface PredictionScore {
  number: string;
  probability: number;
}

export interface PredictionResponse {
  algorithm: string;
  label: string;
  timestamp: string;
  metadata: PredictionMetadata;
  recommended_heads: string[];
  results: PredictionResult[];
  scores: PredictionScore[];
  notes?: string | null;
  related?: PredictionRelated;
}

export interface TailFrequencyGroup {
  prize_name: string;
  prize_rank: number;
  frequencies: TailFrequency[];
}

export interface RefreshResponse {
  start_date: string;
  end_date: string;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface BacktestPredictionItem {
  rank: number;
  number: string;
  probability: number;
  hit: boolean;
}

export interface BacktestDrawResult {
  draw_date: string;
  draw_label: string;
  actual_numbers: string[];
  actual_heads: string[];
  predictions: BacktestPredictionItem[];
  matched_numbers: string[];
  best_rank?: number | null;
  hit: boolean;
  confidence?: number | null;
  history_size: number;
}

export interface BacktestSummary {
  evaluated_draws: number;
  skipped_draws: number;
  hits: number;
  hit_rate: number;
  average_rank_hit?: number | null;
}

export interface BacktestResponse {
  algorithm: string;
  label: string;
  digits: number;
  top_k: number;
  lookback_draws?: number | null;
  evaluation_draws: number;
  summary: BacktestSummary;
  timeline: BacktestDrawResult[];
  parameters: Record<string, unknown>;
}
