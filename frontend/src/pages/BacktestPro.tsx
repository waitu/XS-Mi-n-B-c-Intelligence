import { useEffect, useMemo, useState } from 'react';
import {
  getAvailableRegions,
  runLottoBacktest,
  type LottoBacktestRequestBody,
} from '../api/client';
import { useAsync } from '../hooks/useAsync';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import {
  type LottoBacktestResponse,
  type LottoTimelineEntry,
  type LottoChartPoint,
  type LottoStrategyConfig,
} from '../types';
import { formatDateShort } from '../utils/format';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import jsPDF from 'jspdf';

const MODEL_OPTIONS = [
  { value: 'frequency', label: 'Frequency' },
  { value: 'trend', label: 'Trend Window' },
  { value: 'markov', label: 'Markov Chain' },
  { value: 'montecarlo', label: 'Monte Carlo' },
  { value: 'randomforest', label: 'Random Forest' },
  { value: 'lstm', label: 'Bi-LSTM' },
];

const PRIZE_OPTIONS = [
  { value: 2, label: 'Đặc biệt • 2 số cuối' },
  { value: 3, label: 'Giải lô • 3 số', note: 'Sử dụng 3 chữ số cuối' },
  { value: 4, label: 'Kịch bản custom • 4 số', note: 'Chỉ dùng khi dữ liệu đủ lớn' },
];

const STRATEGY_METADATA: Record<
  string,
  {
    label: string;
    description: string;
    riskLevel: 'Thấp' | 'Trung bình' | 'Trung bình+' | 'Cao' | 'Tùy thuộc';
    defaults: Record<string, number>;
    fields: Array<{
      key: string;
      label: string;
      type: 'number';
      min?: number;
      max?: number;
      step?: number;
    }>;
  }
> = {
  fixed: {
    label: 'Cược cố định',
    description: 'Giữ nguyên mức cược cho từng con số theo top-K dự đoán.',
    riskLevel: 'Thấp',
    defaults: { amount: 10000, count: 5 },
    fields: [
      { key: 'amount', label: 'Tiền mỗi số (VND)', type: 'number', min: 1000, step: 1000 },
      { key: 'count', label: 'Số lượng số đặt cược', type: 'number', min: 1, step: 1 },
    ],
  },
  percentage: {
    label: 'Tỷ lệ % vốn',
    description: 'Phân bổ tỷ lệ cố định của vốn hiện tại vào mỗi phiên.',
    riskLevel: 'Trung bình',
    defaults: { percent: 0.05 },
    fields: [{ key: 'percent', label: 'Phần trăm vốn mỗi kỳ', type: 'number', min: 0.01, max: 0.5, step: 0.01 }],
  },
  kelly: {
    label: 'Kelly xác suất',
    description: 'Điều chỉnh stake dựa trên công thức Kelly có giới hạn.',
    riskLevel: 'Trung bình+',
    defaults: { jackpot_multiplier: 70, max_ratio: 0.08 },
    fields: [
      { key: 'jackpot_multiplier', label: 'Tỉ lệ trả thưởng', type: 'number', min: 10, max: 120, step: 1 },
      { key: 'max_ratio', label: 'Giới hạn tỷ lệ Kelly', type: 'number', min: 0.01, max: 0.2, step: 0.01 },
    ],
  },
  martingale: {
    label: 'Martingale',
    description: 'Tăng cược sau chuỗi thua, reset khi thắng.',
    riskLevel: 'Cao',
    defaults: { base: 5000, multiplier: 2 },
    fields: [
      { key: 'base', label: 'Cược cơ bản (VND)', type: 'number', min: 1000, step: 1000 },
      { key: 'multiplier', label: 'Hệ số nhân sau mỗi thua', type: 'number', min: 1.2, max: 4, step: 0.1 },
    ],
  },
  probability_weighted: {
    label: 'Theo xác suất mô hình',
    description: 'Phân bổ ngân sách theo xác suất dự đoán.',
    riskLevel: 'Trung bình',
    defaults: { budget_ratio: 0.1 },
    fields: [
      { key: 'budget_ratio', label: 'Phần vốn phân bổ', type: 'number', min: 0.02, max: 0.5, step: 0.01 },
    ],
  },
  plugin: {
    label: 'Plugin tùy biến',
    description: 'Chạy file chiến lược TypeScript tùy chỉnh đặt trong backend.',
    riskLevel: 'Tùy thuộc',
    defaults: { },
    fields: [],
  },
};

interface StrategyFormState {
  type: string;
  options: Record<string, number>;
  plugin_id?: string;
}

function getDefaultStrategyState(type: string): StrategyFormState {
  const meta = STRATEGY_METADATA[type] ?? STRATEGY_METADATA.fixed;
  return {
    type,
    options: { ...meta.defaults },
  };
}

interface HeatCell {
  date: string;
  pnl: number;
}

function buildHeatmapData(timeline: LottoTimelineEntry[]): HeatCell[] {
  return timeline.map(entry => ({ date: entry.date, pnl: entry.pnl }));
}

function formatCurrency(value: number): string {
  return value.toLocaleString('vi-VN');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportJson(result: LottoBacktestResponse) {
  const payload = {
    config: result.config,
    summary: result.summary,
    timeline: result.timeline,
    logs: result.logs,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `backtest-pro-${result.config.date_start}-${result.config.date_end}.json`);
}

function exportCsv(result: LottoBacktestResponse) {
  const headers = ['date', 'capital_start', 'stake_total', 'pnl', 'capital_end', 'hits', 'daily_return'];
  const rows = result.timeline.map(entry => [
    entry.date,
    entry.capital_start,
    entry.stake_total,
    entry.pnl,
    entry.capital_end,
    entry.hits.join('|'),
    entry.daily_return,
  ]);
  const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `backtest-pro-${result.config.date_start}-${result.config.date_end}.csv`);
}

function exportPdf(result: LottoBacktestResponse) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('XS Miền Bắc - Báo cáo Backtest Pro', 14, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const summaryLines = [
    `Khoảng thời gian: ${result.config.date_start} → ${result.config.date_end}`,
    `Chiến lược: ${result.config.strategy.type} (${result.config.strategy.risk_level ?? 'n/a'})`,
    `Mô hình: ${result.config.model.toUpperCase()} | Top ${result.config.top_k} | Digits ${result.config.digits}`,
    `Vốn khởi điểm: ${formatCurrency(result.config.capital)} VND`,
    `Vốn cuối: ${formatCurrency(result.summary.final_balance)} VND`,
    `Tổng giao dịch: ${result.summary.total_bets} | Tỉ lệ thắng: ${(result.summary.win_rate * 100).toFixed(2)}%`,
    `Max drawdown: ${formatCurrency(result.summary.max_drawdown)} VND`,
    `Sharpe*: ${result.summary.sharpe_like ? result.summary.sharpe_like.toFixed(2) : '—'}`,
  ];
  let offsetY = 34;
  summaryLines.forEach(line => {
    doc.text(line, 14, offsetY);
    offsetY += 6;
  });
  doc.text('*Sharpe-like: trung bình lợi nhuận ngày / độ lệch chuẩn × √365', 14, offsetY + 4);
  doc.save(`backtest-pro-${result.config.date_start}-${result.config.date_end}.pdf`);
}

function ChartsSection({
  capital,
  accuracy,
  profit,
}: {
  capital: LottoChartPoint[];
  accuracy: LottoChartPoint[];
  profit: LottoChartPoint[];
}) {
  const formatXAxis = (value: string) => formatDateShort(value);
  return (
    <div className="backtest-charts">
      <article className="glow-border backtest-chart-card">
        <header>
          <h3>Đường vốn</h3>
          <span>Balance theo ngày</span>
        </header>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={capital}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="15%" stopColor="var(--accent)" stopOpacity={0.8} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
            <XAxis dataKey="date" tickFormatter={(value: string) => formatXAxis(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tickFormatter={(value: number) => formatCurrency(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip
              formatter={(value: number) => `${formatCurrency(value)} VND`}
              labelFormatter={(label: string) => formatDateShort(label)}
              contentStyle={{ background: '#0f1729', borderRadius: 12, border: '1px solid rgba(148,163,184,0.25)' }}
            />
            <Area type="monotone" dataKey="value" stroke="var(--accent)" fill="url(#balanceGradient)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </article>

      <article className="glow-border backtest-chart-card">
        <header>
          <h3>Tỷ lệ chính xác</h3>
          <span>Hit rate lũy kế</span>
        </header>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={accuracy}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
            <XAxis dataKey="date" tickFormatter={(value: string) => formatXAxis(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis
              domain={[0, 1]}
              tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
            />
            <Tooltip
              formatter={(value: number) => `${(value * 100).toFixed(2)}%`}
              labelFormatter={(label: string) => formatDateShort(label)}
              contentStyle={{ background: '#0f1729', borderRadius: 12, border: '1px solid rgba(148,163,184,0.25)' }}
            />
            <Line type="monotone" dataKey="value" stroke="var(--accent-alt)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </article>

      <article className="glow-border backtest-chart-card">
        <header>
          <h3>Lợi nhuận theo ngày</h3>
          <span>PNL per draw</span>
        </header>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={profit}>
            <defs>
              <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="10%" stopColor="var(--accent-alt)" stopOpacity={0.8} />
                <stop offset="100%" stopColor="var(--accent-alt)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
            <XAxis dataKey="date" tickFormatter={(value: string) => formatXAxis(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tickFormatter={(value: number) => formatCurrency(value)} tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip
              formatter={(value: number) => `${formatCurrency(value)} VND`}
              labelFormatter={(label: string) => formatDateShort(label)}
              contentStyle={{ background: '#0f1729', borderRadius: 12, border: '1px solid rgba(148,163,184,0.25)' }}
            />
            <Area type="monotone" dataKey="value" stroke="var(--accent-alt)" fill="url(#profitGradient)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </article>
    </div>
  );
}

function Heatmap({ data }: { data: HeatCell[] }) {
  if (!data.length) {
    return null;
  }
  return (
    <div className="backtest-heatmap glow-border">
      <header>
        <h3>Hiệu suất theo ngày</h3>
        <span>Màu xanh: lãi • Hồng: lỗ</span>
      </header>
      <div className="backtest-heatmap__grid">
        {data.map(cell => {
          const intensity = Math.max(-1, Math.min(1, cell.pnl === 0 ? 0 : cell.pnl > 0 ? Math.log10(Math.abs(cell.pnl) + 1) / 4 : -Math.log10(Math.abs(cell.pnl) + 1) / 4));
          const className = intensity === 0 ? 'heat-zero' : intensity > 0 ? 'heat-positive' : 'heat-negative';
          return (
            <div key={cell.date} className={`heat-cell ${className}`} title={`${formatDateShort(cell.date)} → ${formatCurrency(cell.pnl)} VND`} />
          );
        })}
      </div>
    </div>
  );
}

function SummaryTable({ result }: { result: LottoBacktestResponse }) {
  const { summary } = result;
  const rows = [
    { label: 'Vốn cuối', value: `${formatCurrency(summary.final_balance)} VND` },
    { label: 'Tổng giao dịch', value: summary.total_bets.toLocaleString('vi-VN') },
    { label: 'Tỉ lệ thắng', value: `${(summary.win_rate * 100).toFixed(2)}%` },
    { label: 'Max drawdown', value: `${formatCurrency(summary.max_drawdown)} VND` },
    { label: 'Best month', value: summary.best_month ? `${summary.best_month} (${formatCurrency(summary.best_month_pnl ?? 0)} VND)` : '—' },
    { label: 'Sharpe-like', value: summary.sharpe_like ? summary.sharpe_like.toFixed(2) : '—' },
    { label: 'Độ chính xác mô hình', value: `${(summary.accuracy * 100).toFixed(2)}%` },
    { label: 'Lí do dừng', value: summary.stop_reason === 'capital_depleted' ? 'Hết vốn' : 'Hoàn tất phạm vi' },
  ];
  return (
    <div className="backtest-summary glow-border">
      <header>
        <h3>Kết luận</h3>
        <span>Chỉ số tổng hợp toàn bộ giai đoạn backtest</span>
      </header>
      <table className="table">
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradesTable({ timeline }: { timeline: LottoTimelineEntry[] }) {
  if (!timeline.length) {
    return null;
  }
  return (
    <div className="backtest-trades glow-border">
      <header>
        <h3>Nhật ký giao dịch</h3>
        <span>Chi tiết từng kỳ quay</span>
      </header>
      <div className="table-responsive" style={{ maxHeight: '420px' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Vốn đầu</th>
              <th>Cược</th>
              <th>PnL</th>
              <th>Vốn cuối</th>
              <th>Hit</th>
              <th>Drawdown</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map(entry => (
              <tr key={entry.date}>
                <td>{formatDateShort(entry.date)}</td>
                <td>{formatCurrency(entry.capital_start)}</td>
                <td>{formatCurrency(entry.stake_total)}</td>
                <td className={entry.pnl >= 0 ? 'text-success' : 'text-danger'}>{formatCurrency(entry.pnl)}</td>
                <td>{formatCurrency(entry.capital_end)}</td>
                <td>{entry.hits.length ? entry.hits.join(', ') : '—'}</td>
                <td>{formatCurrency(entry.drawdown)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BacktestProPage() {
  const today = useMemo(() => new Date(), []);
  const defaultEnd = useMemo(() => today.toISOString().slice(0, 10), [today]);
  const defaultStart = useMemo(() => {
    const clone = new Date(today);
    clone.setDate(clone.getDate() - 90);
    return clone.toISOString().slice(0, 10);
  }, [today]);

  const regionsState = useAsync(async () => {
    const response = await getAvailableRegions();
    return response.regions;
  }, [], { initialData: [] });

  const [capital, setCapital] = useState(1_000_000);
  const [region, setRegion] = useState<string>('');
  const [dateStart, setDateStart] = useState<string>(defaultStart);
  const [dateEnd, setDateEnd] = useState<string>(defaultEnd);
  const [digits, setDigits] = useState<number>(2);
  const [topK, setTopK] = useState<number>(5);
  const [model, setModel] = useState<string>('frequency');
  const [lookback, setLookback] = useState<number | undefined>(120);
  const [seed, setSeed] = useState<number | undefined>();
  const [riskDaily, setRiskDaily] = useState<number>(0.2);
  const [riskSingle, setRiskSingle] = useState<number>(0.1);
  const [jackpotMultiplier, setJackpotMultiplier] = useState<number>(70);
  const [lossMultiplier, setLossMultiplier] = useState<number>(-1);
  const [strategyState, setStrategyState] = useState<StrategyFormState>(() => getDefaultStrategyState('fixed'));
  const [result, setResult] = useState<LottoBacktestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (regionsState.data && regionsState.data.length && !region) {
      setRegion(regionsState.data[0]);
    }
  }, [regionsState.data, region]);

  const capitalCurve = useMemo<LottoChartPoint[]>(
    () => result?.charts.capital_curve ?? [],
    [result],
  );
  const accuracyCurve = useMemo<LottoChartPoint[]>(
    () => result?.charts.accuracy_curve ?? [],
    [result],
  );
  const profitCurve = useMemo<LottoChartPoint[]>(
    () => result?.charts.profit_curve ?? [],
    [result],
  );

  const heatData = useMemo(() => buildHeatmapData(result?.timeline ?? []), [result]);

  const handleStrategyChange = (nextType: string) => {
    setStrategyState(prev => {
      if (nextType === prev.type) {
        return prev;
      }
      const base = getDefaultStrategyState(nextType);
      if (nextType === 'plugin') {
        return { ...base, plugin_id: '' };
      }
      return base;
    });
  };

  const handleRun = async () => {
    if (!dateStart || !dateEnd) {
      setError('Vui lòng chọn khoảng thời gian backtest.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: LottoBacktestRequestBody = {
        capital,
        date_start: dateStart,
        date_end: dateEnd,
        region: region || undefined,
        model,
        top_k: topK,
        digits,
        strategy: {
          type: strategyState.type,
          options: strategyState.options,
          plugin_id: strategyState.plugin_id,
        },
        risk_limits: {
          max_daily_stake_ratio: riskDaily,
          max_single_stake_ratio: riskSingle,
        },
        payout_rules: {
          jackpot_multiplier: jackpotMultiplier,
          loss_multiplier: lossMultiplier,
        },
        lookback_draws: lookback,
        seed,
      };
      const response = await runLottoBacktest(payload);
      setResult(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể chạy backtest';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const strategyMeta = STRATEGY_METADATA[strategyState.type] ?? STRATEGY_METADATA.fixed;
  const riskBadge = result?.config.strategy.risk_level ?? strategyMeta.riskLevel;

  return (
    <main className="backtest-pro">
      <header className="backtest-pro__hero">
        <div>
          <span className="badge">Backtest Pro</span>
          <h1>Mô phỏng chiến lược đặt cược xổ số</h1>
          <p>
            Chọn mô hình dự đoán, cấu hình chiến lược đặt cược và mô phỏng hiệu quả vốn theo dữ liệu lịch sử real-time.
          </p>
        </div>
        <div className="backtest-pro__hero-meta">
          <span>Chiến lược hiện tại</span>
          <strong>{strategyMeta.label}</strong>
          <small>Risk level: {riskBadge}</small>
        </div>
      </header>

      <section className="backtest-pro__form glow-border">
        <div className="form-grid">
          <label>
            Vốn khởi điểm (VND)
            <input type="number" min={100000} step={50000} value={capital} onChange={event => setCapital(Number(event.target.value))} />
          </label>
          <label>
            Tỉnh/Đài (region)
            {regionsState.loading && !regionsState.data ? (
              <LoadingState message="Đang tải danh sách đài" />
            ) : regionsState.error ? (
              <ErrorState message={regionsState.error.message} onRetry={regionsState.reload} />
            ) : (
              <select value={region} onChange={event => setRegion(event.target.value)}>
                {(regionsState.data ?? []).map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label>
            Ngày bắt đầu
            <input type="date" value={dateStart} onChange={event => setDateStart(event.target.value)} />
          </label>
          <label>
            Ngày kết thúc
            <input type="date" value={dateEnd} onChange={event => setDateEnd(event.target.value)} />
          </label>
          <label>
            Loại giải / digits
            <select value={digits} onChange={event => setDigits(Number(event.target.value))}>
              {PRIZE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Thuật toán dự đoán
            <select value={model} onChange={event => setModel(event.target.value)}>
              {MODEL_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Top-N số đặt cược
            <input type="number" min={1} max={20} value={topK} onChange={event => setTopK(Number(event.target.value))} />
          </label>
          <label>
            Lookback draws
            <input
              type="number"
              min={10}
              step={10}
              value={lookback ?? ''}
              placeholder="auto"
              onChange={event => {
                const raw = event.target.value;
                if (raw === '') {
                  setLookback(undefined);
                  return;
                }
                const value = Number(raw);
                setLookback(Number.isNaN(value) ? undefined : value);
              }}
            />
          </label>
          <label>
            Seed (optional)
            <input
              type="number"
              value={seed ?? ''}
              onChange={event => {
                const raw = event.target.value;
                if (raw === '') {
                  setSeed(undefined);
                  return;
                }
                const value = Number(raw);
                setSeed(Number.isNaN(value) ? undefined : value);
              }}
              placeholder="random"
            />
          </label>
        </div>

        <div className="strategy-grid">
          <div className="strategy-selector">
            <label>
              Chiến lược đặt cược
              <select value={strategyState.type} onChange={event => handleStrategyChange(event.target.value)}>
                {Object.entries(STRATEGY_METADATA).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </label>
            <p>{strategyMeta.description}</p>
            {strategyState.type === 'plugin' ? (
              <label>
                Plugin ID
                <input
                  type="text"
                  placeholder="ví dụ: my-strategy"
                  value={strategyState.plugin_id ?? ''}
                  onChange={event => setStrategyState(prev => ({ ...prev, plugin_id: event.target.value }))}
                />
              </label>
            ) : null}
          </div>

          <div className="strategy-options">
            <h4>Tham số chiến lược</h4>
            <div className="strategy-options__grid">
              {strategyMeta.fields.length ? (
                strategyMeta.fields.map(field => (
                  <label key={field.key}>
                    {field.label}
                    <input
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={strategyState.options[field.key] ?? ''}
                      onChange={event => {
                        const value = Number(event.target.value);
                        setStrategyState(prev => ({
                          ...prev,
                          options: { ...prev.options, [field.key]: Number.isNaN(value) ? 0 : value },
                        }));
                      }}
                    />
                  </label>
                ))
              ) : (
                <p style={{ color: 'var(--text-secondary)' }}>Chiến lược plugin sử dụng logic từ file TypeScript backend.</p>
              )}
            </div>
          </div>

          <div className="risk-config">
            <h4>Giới hạn rủi ro & trả thưởng</h4>
            <div className="risk-config__grid">
              <label>
                Tổng cược tối đa / ngày
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={riskDaily}
                  onChange={event => setRiskDaily(Number(event.target.value))}
                />
                <small>{(riskDaily * 100).toFixed(0)}% vốn</small>
              </label>
              <label>
                Cược tối đa / số
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={riskSingle}
                  onChange={event => setRiskSingle(Number(event.target.value))}
                />
                <small>{(riskSingle * 100).toFixed(0)}% vốn</small>
              </label>
              <label>
                Payout trúng (x lần stake)
                <input
                  type="number"
                  min={1}
                  value={jackpotMultiplier}
                  onChange={event => setJackpotMultiplier(Number(event.target.value))}
                />
              </label>
              <label>
                Payout sai (hệ số)
                <input
                  type="number"
                  step={0.1}
                  value={lossMultiplier}
                  onChange={event => setLossMultiplier(Number(event.target.value))}
                />
              </label>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button className="primary" type="button" onClick={handleRun} disabled={loading}>
            {loading ? 'Đang mô phỏng…' : 'Run Backtest'}
          </button>
          {error ? <span className="form-error">{error}</span> : null}
        </div>
      </section>

      {loading && !result ? <LoadingState message="Đang chạy mô phỏng Backtest Pro" /> : null}

      {result ? (
        <section className="backtest-pro__results">
          {result.summary.stop_reason === 'capital_depleted' ? (
            <div className="system-banner system-banner--error">
              <span>Capital warning</span>
              <p>Chiến lược đã cạn vốn trước khi kết thúc giai đoạn. Hãy giảm tỷ lệ cược hoặc chọn chiến lược an toàn hơn.</p>
            </div>
          ) : null}

          <div className="export-actions">
            <button className="ghost" type="button" onClick={() => exportJson(result)}>
              Xuất JSON
            </button>
            <button className="ghost" type="button" onClick={() => exportCsv(result)}>
              Xuất CSV PnL
            </button>
            <button className="ghost" type="button" onClick={() => exportPdf(result)}>
              Xuất PDF Summary
            </button>
          </div>

          <SummaryTable result={result} />
          <ChartsSection capital={capitalCurve} accuracy={accuracyCurve} profit={profitCurve} />
          <Heatmap data={heatData} />
          <TradesTable timeline={result.timeline} />
        </section>
      ) : null}
    </main>
  );
}
