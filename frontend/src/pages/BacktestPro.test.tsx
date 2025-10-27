import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import BacktestProPage from './BacktestPro';
import type { LottoBacktestRequestBody } from '../api/client';

const mockRegions = ['Miền Bắc', 'Miền Trung'];

const mockBacktestResult = {
  config: {
    capital: 1_000_000,
    date_start: '2025-01-01',
    date_end: '2025-02-01',
    region: 'Miền Bắc',
    model: 'frequency',
    top_k: 5,
    digits: 2,
    strategy: {
      type: 'fixed',
      options: { amount: 10000, count: 5 },
      plugin_id: null,
      risk_level: 'Thấp',
    },
    payout_rules: {
      jackpot_multiplier: 70,
      loss_multiplier: -1,
    },
    risk_limits: {
      max_daily_stake_ratio: 0.2,
      max_single_stake_ratio: 0.1,
    },
    lookback_draws: 120,
    seed: null,
  },
  summary: {
    final_balance: 1_250_000,
    total_bets: 45,
    total_wins: 18,
    total_losses: 27,
    win_rate: 0.4,
    max_drawdown: 150000,
    best_month: '2025-01',
    best_month_pnl: 220000,
    sharpe_like: 1.12,
    accuracy: 0.5,
    stop_reason: 'completed',
  },
  timeline: [
    {
      date: '2025-01-01',
      capital_start: 1_000_000,
      capital_end: 1_020_000,
      stake_total: 50_000,
      pnl: 20_000,
      bets: [
        { number: '12', stake: 25_000, hit: true, payout: 100_000, rank: 1, probability: 0.4 },
        { number: '34', stake: 25_000, hit: false, payout: 0, rank: 2, probability: 0.3 },
      ],
      predictions: [
        { rank: 1, number: '12', probability: 0.4 },
        { rank: 2, number: '34', probability: 0.3 },
      ],
      hits: ['12'],
      drawdown: 0,
      daily_return: 0.02,
      capital_halted: false,
    },
  ],
  charts: {
    capital_curve: [
      { date: '2025-01-01', value: 1_000_000 },
      { date: '2025-02-01', value: 1_250_000 },
    ],
    accuracy_curve: [
      { date: '2025-01-01', value: 0.5 },
      { date: '2025-02-01', value: 0.6 },
    ],
    profit_curve: [
      { date: '2025-01-01', value: 20_000 },
      { date: '2025-02-01', value: 15_000 },
    ],
  },
  logs: {
    notes: 'Sample run',
  },
};

const apiMocks = vi.hoisted(() => ({
  getAvailableRegions: vi.fn(async () => ({ regions: mockRegions })),
  runLottoBacktest: vi.fn(async (_payload: LottoBacktestRequestBody) => mockBacktestResult),
}));

vi.mock('../api/client', () => apiMocks);

const getAvailableRegions = apiMocks.getAvailableRegions;
const runLottoBacktest = apiMocks.runLottoBacktest;

describe('BacktestProPage', () => {
  beforeAll(() => {
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, 'ResizeObserver', {
      writable: true,
      configurable: true,
      value: ResizeObserverMock,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads regions, submits request, and renders results summary', async () => {
    render(<BacktestProPage />);

    expect(await screen.findByText(/Mô phỏng chiến lược đặt cược xổ số/i)).toBeInTheDocument();

    const regionSelect = await screen.findByLabelText(/Tỉnh\/Đài/i);
    await waitFor(() => expect(regionSelect).toHaveValue(mockRegions[0]));

    const runButton = screen.getByRole('button', { name: /Run Backtest/i });
    fireEvent.click(runButton);

    await waitFor(() => expect(runLottoBacktest).toHaveBeenCalledTimes(1));

  const payload = (runLottoBacktest.mock.calls[0] as [LottoBacktestRequestBody])[0];
  expect(payload).toMatchObject({
      capital: 1_000_000,
      region: mockRegions[0],
      model: 'frequency',
      top_k: 5,
      digits: 2,
      strategy: {
        type: 'fixed',
        options: {
          amount: 10000,
          count: 5,
        },
      },
      risk_limits: {
        max_daily_stake_ratio: 0.2,
        max_single_stake_ratio: 0.1,
      },
      payout_rules: {
        jackpot_multiplier: 70,
        loss_multiplier: -1,
      },
    });

    expect(await screen.findByText(/Kết luận/i)).toBeInTheDocument();
    expect(screen.getByText('1.250.000 VND')).toBeInTheDocument();
  });
});
