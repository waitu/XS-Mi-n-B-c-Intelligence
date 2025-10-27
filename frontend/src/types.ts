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

export interface RegionListResponse {
  regions: string[];
}

export interface LottoStrategyConfig {
  type: string;
  options: Record<string, unknown>;
  plugin_id?: string | null;
  risk_level?: string;
}

export interface LottoRiskLimits {
  max_daily_stake_ratio: number;
  max_single_stake_ratio: number;
}

export interface LottoPayoutRules {
  jackpot_multiplier: number;
  loss_multiplier: number;
}

export interface LottoBacktestSummary {
  final_balance: number;
  total_bets: number;
  total_wins: number;
  total_losses: number;
  win_rate: number;
  max_drawdown: number;
  best_month?: string | null;
  best_month_pnl?: number | null;
  sharpe_like?: number | null;
  accuracy: number;
  stop_reason: string;
}

export interface LottoTimelineBet {
  number: string;
  stake: number;
  hit: boolean;
  payout: number;
  rank?: number | null;
  probability?: number | null;
}

export interface LottoTimelinePrediction {
  rank: number;
  number: string;
  probability: number | null;
}

export interface LottoTimelineEntry {
  date: string;
  capital_start: number;
  capital_end: number;
  stake_total: number;
  pnl: number;
  bets: LottoTimelineBet[];
  predictions: LottoTimelinePrediction[];
  hits: string[];
  drawdown: number;
  daily_return: number;
  capital_halted: boolean;
}

export interface LottoChartPoint {
  date: string;
  value: number;
}

export interface LottoBacktestCharts {
  capital_curve: LottoChartPoint[];
  accuracy_curve: LottoChartPoint[];
  profit_curve: LottoChartPoint[];
}

export interface LottoBacktestResponse {
  config: {
    capital: number;
    date_start: string;
    date_end: string;
    region?: string | null;
    model: string;
    top_k: number;
    digits: number;
    strategy: LottoStrategyConfig;
    payout_rules: LottoPayoutRules;
    risk_limits: LottoRiskLimits;
    lookback_draws?: number | null;
    seed?: number | null;
  };
  summary: LottoBacktestSummary;
  timeline: LottoTimelineEntry[];
  charts: LottoBacktestCharts;
  logs: Record<string, unknown>;
}
