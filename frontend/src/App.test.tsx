import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

const mockSummary = {
  total_draws: 1024,
  last_updated: '2025-02-03T12:00:00Z',
  prizes_per_rank: {
    '1': 1,
    '2': 2,
  },
};

const mockTailFrequencies = Array.from({ length: 5 }, (_, index) => ({
  tail: `${index}`,
  count: 10 - index,
}));

const mockTailFrequenciesByPrize = [
  {
    prize_name: 'Giải Đặc Biệt',
    prize_rank: 1,
    frequencies: [
      { tail: '01', count: 4 },
      { tail: '02', count: 3 },
    ],
  },
];

const mockNumberFrequencies = Array.from({ length: 5 }, (_, index) => ({
  number: `0${index}`,
  count: 20 - index,
}));

const mockResults = {
  total: 1,
  limit: 7,
  offset: 0,
  items: [
    {
      draw_date: '2025-02-03',
      region: 'Miền Bắc',
      source_url: 'https://example.com',
      prizes: [
        {
          prize_name: 'Giải Đặc Biệt',
          prize_rank: 1,
          number: '12345',
          position: 0,
        },
      ],
    },
  ],
};

const mockPredictions = {
  algorithm: 'frequency',
  label: 'Frequency Intelligence',
  timestamp: '2025-02-03T12:00:00Z',
  metadata: {
    lookback_draws: 90,
    digits: 2,
    runtime_ms: 12.5,
    confidence_score: 0.92,
    top_k: 2,
    notes: 'Tần suất 2 chữ số đầu toàn lịch sử',
  },
  recommended_heads: ['01', '02'],
  results: [
    {
      rank: 1,
      number: '01',
      probability: 0.6,
      supporting_metrics: { count: 6, ratio: 0.6 },
      explanation: 'Tần suất xuất hiện 6 lần',
    },
    {
      rank: 2,
      number: '02',
      probability: 0.4,
      supporting_metrics: { count: 4, ratio: 0.4 },
      explanation: 'Tần suất xuất hiện 4 lần',
    },
  ],
  scores: [
    { number: '01', probability: 0.6 },
    { number: '02', probability: 0.4 },
  ],
  notes: 'Dựa trên tần suất gần nhất',
};

vi.mock('./api/client', () => ({
  getSummary: vi.fn(async () => mockSummary),
  getTailFrequencies: vi.fn(async () => mockTailFrequencies),
  getTailFrequenciesByPrize: vi.fn(async () => mockTailFrequenciesByPrize),
  getNumberFrequencies: vi.fn(async () => mockNumberFrequencies),
  getResults: vi.fn(async () => mockResults),
  getPredictions: vi.fn(async () => mockPredictions),
  downloadResultsExcel: vi.fn(async () => ({ blob: new Blob(), filename: 'xsmb.xlsx' })),
  refreshData: vi.fn(async () => ({
    start_date: '2025-01-01',
    end_date: '2025-02-03',
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  })),
  refreshDay: vi.fn(async () => ({
    start_date: '2025-02-03',
    end_date: '2025-02-03',
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  })),
  refreshMonth: vi.fn(async () => ({
    start_date: '2025-02-01',
    end_date: '2025-02-03',
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  })),
  refreshYear: vi.fn(async () => ({
    start_date: '2025-01-01',
    end_date: '2025-02-03',
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  })),
  getBacktestHeads: vi.fn(async () => ({
    algorithm: 'frequency',
    label: 'Frequency Intelligence',
    digits: 2,
    top_k: 2,
    lookback_draws: 90,
    evaluation_draws: 2,
    summary: {
      evaluated_draws: 2,
      skipped_draws: 0,
      hits: 1,
      hit_rate: 0.5,
      average_rank_hit: 1,
    },
    timeline: [
      {
        draw_date: '2025-02-02',
        draw_label: '2025-02-02',
        actual_numbers: ['12345'],
        actual_heads: ['12'],
        predictions: [
          { rank: 1, number: '12', probability: 0.6, hit: true },
          { rank: 2, number: '03', probability: 0.4, hit: false },
        ],
        matched_numbers: ['12'],
        best_rank: 1,
        hit: true,
        confidence: 0.9,
        history_size: 10,
      },
    ],
    parameters: {},
  })),
}));

describe('App dashboard', () => {
  it('renders headline sections and data snapshots', async () => {
    render(<App />);

    expect(await screen.findByText(/Radar xổ số/)).toBeInTheDocument();
    expect(await screen.findByText(/Frequency Intelligence/)).toBeInTheDocument();
    expect(await screen.findByText(/Ổn áp thống kê/)).toBeInTheDocument();
    expect(await screen.findByText(/Bảng điện tử kết quả mới nhất/)).toBeInTheDocument();
    expect(await screen.findByText(/Backtest/)).toBeInTheDocument();
  });
});
