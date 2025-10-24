import { useMemo, useState, type ChangeEvent } from 'react';
import Header from './components/Header';
import LoadingState from './components/LoadingState';
import ErrorState from './components/ErrorState';
import SummaryCards from './components/SummaryCards';
import TailHeatmap from './components/TailHeatmap';
import TailByPrizePanel from './components/TailByPrizePanel';
import NumberFrequencyList from './components/NumberFrequencyList';
import ResultsBoard from './components/ResultsBoard';
import PredictionPanel from './components/PredictionPanel';
import IngestionPanel from './components/IngestionPanel';
import { useAsync } from './hooks/useAsync';
import {
  downloadResultsExcel,
  getBacktestHeads,
  getNumberFrequencies,
  getPredictions,
  getResults,
  getSummary,
  getTailFrequencies,
  getTailFrequenciesByPrize,
  refreshData,
  refreshDay,
  refreshMonth,
  refreshYear,
  type GetResultsOptions,
} from './api/client';
import type { NumberFrequency, RefreshResponse, SummaryStats, TailFrequency, TailFrequencyGroup } from './types';
import { formatDateShort } from './utils/format';

const DEFAULT_NUMBER_LIMIT = 30;
const DEFAULT_RESULTS_LIMIT = 7;
const DEFAULT_BACKTEST_WINDOW = 30;

export default function App() {
  const [numberLimit, setNumberLimit] = useState(DEFAULT_NUMBER_LIMIT);
  const [resultsLimit, setResultsLimit] = useState(DEFAULT_RESULTS_LIMIT);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [algorithm, setAlgorithm] = useState('frequency');
  const [topK, setTopK] = useState(5);
  const [digits, setDigits] = useState(2);
  const [lookback, setLookback] = useState(120);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [showIngestion, setShowIngestion] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'success' | 'error'>('success');
  const [exportStart, setExportStart] = useState<string>('');
  const [exportEnd, setExportEnd] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [backtestWindow, setBacktestWindow] = useState(DEFAULT_BACKTEST_WINDOW);

  const summaryState = useAsync<SummaryStats | null>(() => getSummary(), [], { initialData: null });
  const tailState = useAsync<TailFrequency[]>(() => getTailFrequencies(12), [], { initialData: [] });
  const tailByPrizeState = useAsync<TailFrequencyGroup[]>(
    () => getTailFrequenciesByPrize({ limit: 5, digits: 2 }),
    [],
    { initialData: [] },
  );
  const numberState = useAsync<NumberFrequency[]>(
    () => getNumberFrequencies(numberLimit),
    [numberLimit],
    { initialData: [] },
  );
  const resultsState = useAsync(
    () => getResults(buildResultsOptions({ limit: resultsLimit, date: selectedDate })),
    [resultsLimit, selectedDate],
  );
  const predictionState = useAsync(
    () =>
      getPredictions({
        algorithm,
        top_k: topK,
        digits,
        lookback_draws: lookback,
        advanced: advancedMode,
      }),
    [algorithm, topK, digits, lookback, advancedMode],
  );

  const backtestState = useAsync(
    () =>
      getBacktestHeads({
        algorithm,
        top_k: topK,
        digits,
        lookback_draws: lookback,
        evaluation_draws: backtestWindow,
      }),
    [algorithm, topK, digits, lookback, backtestWindow],
    { initialData: null },
  );

  const prizeDistribution = useMemo(() => {
    if (!summaryState.data?.prizes_per_rank) return [] as Array<[string, number]>;
    return Object.entries(summaryState.data.prizes_per_rank).sort((a, b) => {
      const rankA = Number.parseInt(a[0], 10);
      const rankB = Number.parseInt(b[0], 10);
      if (Number.isNaN(rankA) || Number.isNaN(rankB)) {
        return a[0].localeCompare(b[0]);
      }
      return rankA - rankB;
    });
  }, [summaryState.data]);

  const reloadEverything = async () => {
    await Promise.all([
      summaryState.reload(),
      tailState.reload(),
      tailByPrizeState.reload(),
      numberState.reload(),
      resultsState.reload(),
      predictionState.reload(),
      backtestState.reload(),
    ]);
  };

  const describeRefresh = (result: RefreshResponse) => {
    const start = formatDateShort(result.start_date);
    const end = formatDateShort(result.end_date);
    const range = start === end ? start : `${start} → ${end}`;
    return `Đồng bộ ${range}: ${result.created} mới, ${result.updated} cập nhật, ${result.skipped} bỏ qua, ${result.failed} lỗi.`;
  };

  const runIngestion = async (runner: () => Promise<RefreshResponse>) => {
    try {
      setRefreshing(true);
      setFeedback(null);
      const response = await runner();
      setFeedbackType('success');
      setFeedback(describeRefresh(response));
      await reloadEverything();
    } catch (error) {
      setFeedbackType('error');
      setFeedback((error as Error)?.message ?? 'Không thể đồng bộ dữ liệu.');
      throw error;
    } finally {
      setRefreshing(false);
    }
  };

  const handleQuickRefresh = () => {
    runIngestion(() => refreshData({ force: true })).catch(() => undefined);
  };

  const handleRangeRefresh = async ({
    startDate,
    endDate,
    force = false,
  }: {
    startDate?: string;
    endDate?: string;
    force?: boolean;
  }) => {
    await runIngestion(() => refreshData({ start_date: startDate, end_date: endDate, force })).catch(
      () => undefined,
    );
  };

  const handleDayRefresh = async (date: string, force: boolean) => {
    await runIngestion(() => refreshDay({ date, force })).catch(() => undefined);
  };

  const handleMonthRefresh = async (year: number, month: number, force: boolean) => {
    await runIngestion(() => refreshMonth({ year, month, force })).catch(() => undefined);
  };

  const handleYearRefresh = async (year: number, force: boolean) => {
    await runIngestion(() => refreshYear({ year, force })).catch(() => undefined);
  };

  const handleDateChange = (value: string) => {
    setSelectedDate(value);
  };

  const handleClearDate = () => {
    setSelectedDate('');
  };

  const handleDownloadExcel = async () => {
    if (exportStart && exportEnd) {
      const start = new Date(exportStart);
      const end = new Date(exportEnd);
      if (Number.isFinite(start.valueOf()) && Number.isFinite(end.valueOf()) && start > end) {
        setFeedbackType('error');
        setFeedback('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.');
        return;
      }
    }

    try {
      setExporting(true);
      const { blob, filename } = await downloadResultsExcel({
        start_date: exportStart || undefined,
        end_date: exportEnd || undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const startLabel = exportStart ? formatDateShort(exportStart) : 'từ đầu năm';
      const endLabel = exportEnd ? formatDateShort(exportEnd) : 'đến hôm nay';
      setFeedbackType('success');
      setFeedback(`Đã tải tệp Excel (${startLabel} → ${endLabel}).`);
    } catch (error) {
      setFeedbackType('error');
      setFeedback((error as Error)?.message ?? 'Không thể tải Excel.');
    } finally {
      setExporting(false);
    }
  };

  const handleAdvancedToggle = (value: boolean) => {
    setAdvancedMode(value);
    if (!value) {
      const advancedSet = new Set(['randomforest', 'lstm', 'genetic', 'naivebayes', 'prophet']);
      setAlgorithm(prev => (advancedSet.has(prev) ? 'frequency' : prev));
    }
  };

  return (
    <main>
      <Header lastUpdated={summaryState.data?.last_updated ?? null} onRefresh={handleQuickRefresh} refreshing={refreshing} />

      {feedback ? (
        <div className={`system-banner system-banner--${feedbackType}`}>
          <span>{feedbackType === 'success' ? 'Đồng bộ thành công' : 'Có lỗi phát sinh'}</span>
          <p>{feedback}</p>
        </div>
      ) : null}

      <section className="command-center">
        <div className="command-center__primary">
          <PredictionPanel
            data={predictionState.data ?? null}
            algorithm={algorithm}
            topK={topK}
            digits={digits}
            lookback={lookback}
            advancedMode={advancedMode}
            onAlgorithmChange={setAlgorithm}
            onTopKChange={setTopK}
            onDigitsChange={setDigits}
            onLookbackChange={setLookback}
            onAdvancedToggle={handleAdvancedToggle}
            onReload={predictionState.reload}
            loading={predictionState.loading}
            backtest={backtestState.data ?? null}
            backtestLoading={backtestState.loading}
            backtestError={backtestState.error}
            backtestWindow={backtestWindow}
            onBacktestWindowChange={setBacktestWindow}
            onBacktestReload={backtestState.reload}
          />
        </div>

        <div className="command-center__side">
          {summaryState.loading && !summaryState.data ? (
            <LoadingState message="Đang tổng hợp thống kê tổng quan" />
          ) : summaryState.error ? (
            <ErrorState message={summaryState.error.message} onRetry={summaryState.reload} />
          ) : (
            <SummaryCards data={summaryState.data} variant="compact" />
          )}

          <article className="intel-console glow-border">
            <h3>Radar trạng thái</h3>
            <div className="intel-console__body">
              <span className="pulse">Luồng dữ liệu trực tiếp</span>
              <small>
                Chế độ advanced
                {advancedMode
                  ? ' đang bật — chiến thuật AI lấy số liệu sâu.'
                  : ' đang tắt — tập trung vào thống kê cổ điển.'}
              </small>
              <div className="intel-console__actions">
                <button className="ghost" type="button" onClick={handleQuickRefresh} disabled={refreshing}>
                  {refreshing ? 'Đang đồng bộ chung…' : 'Làm mới toàn hệ thống'}
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => setShowIngestion(prev => !prev)}
                >
                  {showIngestion ? 'Ẩn điều phối dữ liệu' : 'Hiện điều phối dữ liệu'}
                </button>
              </div>
            </div>
          </article>

          {showIngestion ? (
            <IngestionPanel
              onRefreshRange={handleRangeRefresh}
              onRefreshDay={handleDayRefresh}
              onRefreshMonth={handleMonthRefresh}
              onRefreshYear={handleYearRefresh}
              busy={refreshing}
            />
          ) : (
            <article className="glow-border ingestion-placeholder">
              <h4>Điều phối đồng bộ đang ẩn</h4>
              <p>Không gian được giải phóng — bật lại khi cần đồng bộ dữ liệu.</p>
              <button className="ghost" type="button" onClick={() => setShowIngestion(true)}>
                Hiển thị điều phối
              </button>
            </article>
          )}
        </div>
      </section>

      <section className="analytics-reactor">
        <div className="section-title">
          Ổn áp thống kê
          <span>Khai phá tần suất số và đuôi</span>
        </div>

        <div className="analytics-reactor__grid">
          <article className="glow-border analytics-card">
            <div className="analytics-card__header">
              <h3>Top tần suất</h3>
              <label>
                Số hàng
                <input
                  type="number"
                  min={5}
                  max={100}
                  step={5}
                  value={numberLimit}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setNumberLimit(Number(event.target.value) || DEFAULT_NUMBER_LIMIT)
                  }
                />
              </label>
            </div>
            {numberState.loading && (numberState.data?.length ?? 0) === 0 ? (
              <LoadingState message="Đang quét tần suất từng con số" />
            ) : numberState.error ? (
              <ErrorState message={numberState.error.message} onRetry={numberState.reload} />
            ) : (
              <NumberFrequencyList data={numberState.data ?? []} />
            )}
          </article>

          <article className="glow-border analytics-card">
            <div className="analytics-card__header">
              <h3>Đuôi đang nóng</h3>
              <span className="badge-ghost">2 chữ số cuối</span>
            </div>
            {tailState.loading && (tailState.data?.length ?? 0) === 0 ? (
              <LoadingState message="Đang tính tần suất đuôi" />
            ) : tailState.error ? (
              <ErrorState message={tailState.error.message} onRetry={tailState.reload} />
            ) : (
              <TailHeatmap data={tailState.data ?? []} />
            )}
          </article>

          <article className="glow-border analytics-card">
            <div className="analytics-card__header">
              <h3>Đuôi theo từng giải</h3>
              <span className="badge-ghost">Top 5 mỗi giải</span>
            </div>
            {tailByPrizeState.loading && (tailByPrizeState.data?.length ?? 0) === 0 ? (
              <LoadingState message="Đang phân tích từng giải" />
            ) : tailByPrizeState.error ? (
              <ErrorState message={tailByPrizeState.error.message} onRetry={tailByPrizeState.reload} />
            ) : (
              <TailByPrizePanel data={tailByPrizeState.data ?? []} />
            )}
          </article>
        </div>
      </section>

      <section className="analytics-reactor" style={{ marginTop: '2.75rem' }}>
        <div className="section-title">
          Phân bố giải thưởng
          <span>Đếm theo hạng giải</span>
        </div>
        <article className="glow-border analytics-card" style={{ overflowX: 'auto' }}>
          {prizeDistribution.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Hạng giải</th>
                  <th>Tổng số giải</th>
                </tr>
              </thead>
              <tbody>
                {prizeDistribution.map(([rank, count]) => (
                  <tr key={rank}>
                    <td>Giải {rank}</td>
                    <td>{count.toLocaleString('vi-VN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <small style={{ color: 'var(--text-secondary)' }}>Chưa có dữ liệu phân bố.</small>
          )}
        </article>
      </section>

      <section className="analytics-reactor" style={{ marginTop: '2.75rem' }}>
        <div className="section-title">
          Bảng điện tử kết quả mới nhất
          <span>Theo dõi từng kỳ quay</span>
        </div>
        <article className="glow-border analytics-card">
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
              Lọc theo ngày
              <input
                type="date"
                value={selectedDate}
                onChange={(event: ChangeEvent<HTMLInputElement>) => handleDateChange(event.target.value)}
                style={{ minWidth: '180px' }}
              />
            </label>
            {selectedDate ? (
              <button className="ghost" type="button" onClick={handleClearDate}>
                Bỏ lọc
              </button>
            ) : null}
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
              Số kỳ hiển thị
              <input
                type="number"
                min={3}
                max={30}
                value={resultsLimit}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setResultsLimit(Number(event.target.value) || DEFAULT_RESULTS_LIMIT)
                }
                style={{ minWidth: '120px' }}
              />
            </label>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              marginBottom: '1.5rem',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
              Xuất Excel từ ngày
              <input
                type="date"
                value={exportStart}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setExportStart(event.target.value)}
                style={{ minWidth: '180px' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.85rem' }}>
              Đến ngày
              <input
                type="date"
                value={exportEnd}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setExportEnd(event.target.value)}
                style={{ minWidth: '180px' }}
              />
            </label>
            <button
              className="primary"
              type="button"
              style={{ minWidth: '160px' }}
              onClick={handleDownloadExcel}
              disabled={exporting}
            >
              {exporting ? 'Đang chuẩn bị Excel…' : 'Tải Excel'}
            </button>
          </div>

          {resultsState.loading && !resultsState.data ? (
            <LoadingState message="Đang tải lịch sử kỳ quay" />
          ) : resultsState.error ? (
            <ErrorState message={resultsState.error.message} onRetry={resultsState.reload} />
          ) : (
            <ResultsBoard draws={resultsState.data?.items ?? []} />
          )}
        </article>
      </section>

      <section className="data-console" style={{ marginBottom: '3rem' }}>
        <div className="glow-border console-panel">
          <div className="console-panel__header">
            <h3>Console sự kiện</h3>
            <span className="badge-ghost">Live feed</span>
          </div>
          <div className="console-panel__body">
            <p>
              {feedback
                ? feedback
                : 'Đang chờ hoạt động mới… Bất kỳ lần đồng bộ hoặc dự đoán lại sẽ hiển thị tại đây.'}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function buildResultsOptions({ limit, date, offset }: GetResultsOptions) {
  return {
    limit,
    offset,
    date: date && date.length > 0 ? date : undefined,
  } satisfies GetResultsOptions;
}
