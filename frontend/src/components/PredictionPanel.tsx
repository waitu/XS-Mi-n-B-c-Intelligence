import { useMemo, type ChangeEvent } from 'react';
import AlgorithmSelector from './AlgorithmSelector';
import type { BacktestResponse, PredictionResponse, PredictionResult } from '../types';
import { formatDateShort } from '../utils/format';

interface PredictionPanelProps {
  data: PredictionResponse | null;
  algorithm: string;
  topK: number;
  digits: number;
  lookback: number;
  advancedMode: boolean;
  onAlgorithmChange: (algorithm: string) => void;
  onTopKChange: (topK: number) => void;
  onDigitsChange: (digits: number) => void;
  onLookbackChange: (lookback: number) => void;
  onAdvancedToggle: (advanced: boolean) => void;
  onReload?: () => void;
  loading?: boolean;
  backtest: BacktestResponse | null;
  backtestLoading?: boolean;
  backtestError?: Error | null;
  backtestWindow: number;
  onBacktestWindowChange: (value: number) => void;
  onBacktestReload?: () => void;
}

const defaultDescriptor = {
  title: 'Thuật toán mặc định',
  tagline: 'Dự đoán nhanh từ lịch sử',
  blurb: 'Kết hợp thống kê đơn giản để tìm các đầu số xuất hiện nhiều.',
  pseudo: 'score(num) = count(num) / total',
};

const algorithmLibrary: Record<string, typeof defaultDescriptor> = {
  frequency: {
    title: 'Frequency Intelligence',
    tagline: 'Đếm nhiệt độ đầu số, phân loại hot vs cold',
    blurb: 'freq(num) = count(num) / total draw. Ưu tiên các điểm nóng và bổ sung vài điểm lạnh làm đối trọng.',
    pseudo: 'freq[num] = count(num) / total; ranked = sort_desc(freq)',
  },
  trend: {
    title: 'Trend Hunter',
    tagline: 'Phát hiện số đang tăng nhiệt',
    blurb: 'Sử dụng trung bình động 5/10 kỳ để phát hiện đầu số có xu hướng tăng trước khi hạ nhiệt.',
    pseudo: 'trend = MA5(num) - MA10(num); score = freq(num) * (1 + trend)',
  },
  randomized: {
    title: 'Chaos Weighted',
    tagline: 'Random có trọng số, tạo gia vị bất ngờ',
    blurb: 'Lấy phân phối chuẩn hóa rồi sampling với seed ổn định để tạo tổ hợp dị biệt.',
    pseudo: 'candidate = weighted_sample(freq, seed); reinforce diversity',
  },
  markov: {
    title: 'Markov Strike',
    tagline: 'Ma trận chuyển tiếp đầu số',
    blurb: 'Tập trung vào xác suất chuyển tiếp từ đầu số cuối cùng sang trạng thái kế tiếp.',
    pseudo: 'P[j|k] = count(k→j) / count(k); next = argmax P[*|last]',
  },
  montecarlo: {
    title: 'Monte Carlo Forge',
    tagline: 'Giả lập nhiều lần để ước lượng xác suất',
    blurb: 'Lặp mô phỏng trên phân phối có trọng số để thu được ước lượng phân phối đầu số.',
    pseudo: 'for n in 1..N: outcome = weighted_random(freq)',
  },
  randomforest: {
    title: 'Random Forest Lab',
    tagline: 'Học máy tổng hợp',
    blurb: 'Đào tạo trên các đặc trưng tần suất, đồng xuất hiện và chuyển tiếp để ước lượng xác suất.',
    pseudo: 'model = RandomForestClassifier.fit(X, y); probs = model.predict_proba(latest)',
  },
  lstm: {
    title: 'Bi-LSTM Reactor',
    tagline: 'Giải mã chuỗi thời gian hai chiều',
    blurb: 'Xử lý pattern dài hạn bằng LSTM, dự đoán top-k dựa trên softmax.',
    pseudo: 'logits = BiLSTM(window_seq); probs = softmax(logits)',
  },
  genetic: {
    title: 'Genetic Forge',
    tagline: 'Tiến hóa quần thể đầu số',
    blurb: 'Chọn lọc tự nhiên, lai ghép và đột biến để tìm combo bá đạo.',
    pseudo: 'population -> fitness -> selection -> crossover -> mutation',
  },
  naivebayes: {
    title: 'Naive Bayes Radar',
    tagline: 'Ước lượng nhanh theo giả định độc lập',
    blurb: 'Kết hợp đặc trưng thời gian và trạng thái, áp dụng Bayes để xếp hạng xác suất.',
    pseudo: 'P(num|features) ∝ Π P(feature|num) * P(num)',
  },
  prophet: {
    title: 'Prophet Horizon',
    tagline: 'Forecast chuỗi mùa vụ',
    blurb: 'Dự báo tần suất theo thời gian, tìm điểm bứt phá trong tương lai gần.',
    pseudo: 'forecast = Prophet.fit(series).predict(+1); score = forecast.yhat',
  },
};

function createDisplayResults(data: PredictionResponse | null, fallbackNotes: string): PredictionResult[] {
  if (!data) return [];
  if (Array.isArray(data.results) && data.results.length > 0) {
    return data.results.map(item => ({
      ...item,
      supporting_metrics: item.supporting_metrics ?? undefined,
    }));
  }

  if (Array.isArray(data.scores) && data.scores.length > 0) {
    return data.scores.map((score, index) => ({
      number: score.number,
      probability: score.probability ?? 0,
      rank: index + 1,
      explanation: data.notes ?? fallbackNotes,
    }));
  }

  if (!data.recommended_heads || data.recommended_heads.length === 0) {
    return [];
  }

  const uniform = data.recommended_heads.length ? 1 / data.recommended_heads.length : 0;
  return data.recommended_heads.map((number, index) => ({
    number,
    rank: index + 1,
    probability: uniform,
    explanation: data.notes ?? fallbackNotes,
  }));
}

function formatProbability(probability?: number): string {
  if (probability === undefined || Number.isNaN(probability)) {
    return '—';
  }
  const percent = probability <= 1 ? probability * 100 : probability;
  return `${percent.toFixed(1)}%`;
}

export default function PredictionPanel({
  data,
  algorithm,
  topK,
  digits,
  lookback,
  advancedMode,
  onAlgorithmChange,
  onTopKChange,
  onDigitsChange,
  onLookbackChange,
  onAdvancedToggle,
  onReload,
  loading,
  backtest,
  backtestLoading,
  backtestError,
  backtestWindow,
  onBacktestWindowChange,
  onBacktestReload,
}: PredictionPanelProps) {
  const descriptor = algorithmLibrary[algorithm] ?? defaultDescriptor;
  const title = data?.label ?? descriptor.title;
  // Use metadata.notes if available but prefer a short tagline from descriptor
  const tagline = data?.metadata?.notes ?? descriptor.tagline;

  const results = useMemo(
    () => createDisplayResults(data, descriptor.blurb),
    [data, descriptor.blurb],
  );

  const metadata = data?.metadata;
  const backtestSummary = backtest?.summary;
  const backtestTimeline = backtest?.timeline ?? [];
  const previewTimeline = backtestTimeline.slice(-5).reverse();

  const handleBacktestWindowChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value) || backtestWindow;
    const clamped = Math.min(Math.max(value, 5), 200);
    onBacktestWindowChange(clamped);
  };

  return (
    <section className="prediction-lab glow-border">
      <header className="prediction-lab__header">
        <div>
          <h2>{title}</h2>
          <p>{tagline}</p>
        </div>
        <div className="prediction-lab__actions">
          <div className={`status-chip ${loading ? 'status-chip--active' : ''}`}>
            {loading ? 'AI đang tính toán…' : 'Sẵn sàng'}
          </div>
          <button className="primary" onClick={onReload} type="button" disabled={loading}>
            {loading ? 'Đang chạy' : 'Làm mới'}
          </button>
        </div>
      </header>

      <AlgorithmSelector
        algorithm={algorithm}
        topK={topK}
        digits={digits}
        lookback={lookback}
        advanced={advancedMode}
        onAlgorithmChange={onAlgorithmChange}
        onTopKChange={onTopKChange}
        onDigitsChange={onDigitsChange}
        onLookbackChange={onLookbackChange}
        onAdvancedToggle={onAdvancedToggle}
      />

      <div className="prediction-lab__blurb">
        <span>Mô tả chiến thuật:</span>
        <p>{descriptor.blurb}</p>
        {data?.notes ? <p className="prediction-lab__note">{data.notes}</p> : null}
      </div>

      <div className="prediction-grid">
        <div className="prediction-grid__header">
          <span>#</span>
          <span>Số</span>
          <span>Xác suất</span>
          <span>Ghi chú</span>
        </div>
        {results.length === 0 ? (
          <div className="prediction-grid__empty">Chưa có dữ liệu dự đoán cho cấu hình hiện tại.</div>
        ) : (
          results.slice(0, topK).map(result => (
            <div key={`${result.rank}-${result.number}`} className="prediction-grid__row">
              <span className="prediction-grid__rank">#{result.rank}</span>
              <span className="prediction-grid__number">{result.number}</span>
              <span className="prediction-grid__probability">
                <span
                  className="probability-bar"
                  style={{ width: `${Math.min(Math.max(result.probability * 100, 6), 100)}%` }}
                />
                <span className="probability-value">{formatProbability(result.probability)}</span>
              </span>
              <span className="prediction-grid__note">{result.explanation ?? descriptor.blurb}</span>
            </div>
          ))
        )}
      </div>

      <div className="prediction-backtest">
        <div className="prediction-backtest__header">
          <div>
            <h3>Backtest {backtest?.evaluation_draws ?? backtestWindow} kỳ gần nhất</h3>
            {backtestSummary ? (
              <p>
                Tỷ lệ trúng {formatProbability(backtestSummary.hit_rate)} · {backtestSummary.hits} lần trúng /{' '}
                {backtestSummary.evaluated_draws} kỳ · Hạng trung bình khi trúng:{' '}
                {backtestSummary.average_rank_hit ? backtestSummary.average_rank_hit.toFixed(1) : '—'}
              </p>
            ) : (
              <p>Đánh giá lịch sử dựa trên cấu hình hiện tại.</p>
            )}
          </div>
          <div className="prediction-backtest__actions">
            <label>
              <span>Số kỳ backtest</span>
              <input
                type="number"
                min={5}
                max={200}
                value={backtestWindow}
                onChange={handleBacktestWindowChange}
              />
            </label>
            <button
              className="ghost"
              type="button"
              onClick={onBacktestReload}
              disabled={backtestLoading}
            >
              {backtestLoading ? 'Đang backtest…' : 'Chạy lại'}
            </button>
          </div>
        </div>

        {backtestLoading ? (
          <div className="prediction-grid__empty">Đang chạy backtest, vui lòng chờ…</div>
        ) : backtestError ? (
          <div className="prediction-grid__empty">Không thể chạy backtest: {backtestError.message}</div>
        ) : backtestSummary && backtestSummary.evaluated_draws > 0 ? (
          <div className="backtest-timeline">
            {previewTimeline.map(item => (
              <div
                key={item.draw_date}
                className={`backtest-timeline__item ${item.hit ? 'backtest-timeline__item--hit' : 'backtest-timeline__item--miss'}`}
              >
                <div className="backtest-timeline__meta">
                  <strong>{formatDateShort(item.draw_date)}</strong>
                  <span>{item.hit ? `Trúng ${item.matched_numbers.join(', ')}` : 'Chưa trúng'}</span>
                </div>
                <div className="backtest-timeline__body">
                  <div>
                    <small>Gợi ý:</small>
                    <span>
                      {item.predictions
                        .map(pred => `${pred.number}${pred.hit ? ' ✔' : ''}`)
                        .join(', ')}
                    </span>
                  </div>
                  <div>
                    <small>Kết quả:</small>
                    <span>{item.actual_heads.join(', ') || '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="prediction-grid__empty">Chưa đủ dữ liệu để backtest cấu hình này.</div>
        )}
      </div>

      <footer className="prediction-lab__footer">
        <div className="metadata-block">
          <h4>Thông số pipeline</h4>
          <ul>
            <li>
              <strong>Cửa sổ phân tích:</strong> {metadata?.lookback_draws ?? lookback} kỳ
            </li>
            <li>
              <strong>Số chữ số cuối:</strong> {metadata?.digits ?? digits}
            </li>
            {metadata?.top_k !== undefined ? (
              <li>
                <strong>Top-K:</strong> {metadata.top_k}
              </li>
            ) : null}
            {metadata?.confidence_score !== undefined ? (
              <li>
                <strong>Độ tin cậy:</strong> {(metadata.confidence_score * 100).toFixed(1)}%
              </li>
            ) : null}
            {metadata?.runtime_ms !== undefined ? (
              <li>
                <strong>Thời gian chạy:</strong> {metadata.runtime_ms.toLocaleString('vi-VN')} ms
              </li>
            ) : null}
          </ul>
        </div>

        <div className="metadata-block">
          <h4>Mô tả thuật toán</h4>
          <pre>{data?.related?.pseudo_code ?? descriptor.pseudo}</pre>
        </div>

        {data?.related?.hot_numbers ? (
          <div className="metadata-block">
            <h4>Số nóng / số lạnh</h4>
            <p>
              Số nóng (thường xuất hiện): {data.related.hot_numbers.join(', ')}
            </p>
            {data.related.cold_numbers ? (
              <p>Số lạnh (ít xuất hiện): {data.related.cold_numbers.join(', ')}</p>
            ) : null}
          </div>
        ) : null}
      </footer>
    </section>
  );
}
