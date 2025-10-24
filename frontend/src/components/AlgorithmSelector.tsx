import type { ChangeEvent } from 'react';

interface AlgorithmDescriptor {
  value: string;
  label: string;
  category: string;
  description: string;
  advanced?: boolean;
  badge?: string;
}

const ALGORITHMS: AlgorithmDescriptor[] = [
  {
    value: 'frequency',
    label: 'Tần suất cổ điển',
    category: 'Cổ điển',
    description: 'Đếm tần suất xuất hiện và ưu tiên các đầu số nóng trong cửa sổ quan sát.',
  },
  {
    value: 'trend',
    label: 'Xu hướng động',
    category: 'Cổ điển',
    description: 'Phân tích moving average và độ dốc để phát hiện đầu số tăng tốc.',
  },
  {
    value: 'markov',
    label: 'Chuỗi Markov',
    category: 'Xác suất',
    description: 'Mô hình hóa chuyển tiếp giữa các trạng thái đầu số, dự đoán điểm hội tụ tiếp theo.',
  },
  {
    value: 'montecarlo',
    label: 'Monte Carlo',
    category: 'Xác suất',
    description: 'Giả lập hàng ngàn phiên quay dựa trên xác suất lịch sử để trích xuất phân phối đầu số.',
  },
  {
    value: 'randomized',
    label: 'Ngẫu nhiên có trọng số',
    category: 'Xác suất',
    description: 'Tăng gia vị bằng random seed nhưng vẫn duy trì trọng số theo dữ liệu.',
  },
  {
    value: 'randomforest',
    label: 'Random Forest',
    category: 'AI nâng cao',
    description: 'Học máy với hàng trăm cây quyết định, đánh giá xác suất xuất hiện của từng đầu số.',
    advanced: true,
    badge: 'Advanced',
  },
  {
    value: 'lstm',
    label: 'Bi-LSTM',
    category: 'AI nâng cao',
    description: 'Mạng nơ-ron tuần tự hai chiều, xử lý ký ức dài và nắm bắt pattern phức tạp.',
    advanced: true,
    badge: 'Advanced',
  },
  {
    value: 'genetic',
    label: 'Genetic Algorithm',
    category: 'AI nâng cao',
    description: 'Tiến hóa quần thể đầu số, chọn lọc tự nhiên để tìm lời giải bá đạo.',
    advanced: true,
    badge: 'Bá đạo',
  },
  {
    value: 'naivebayes',
    label: 'Naive Bayes',
    category: 'AI nâng cao',
    description: 'Ước lượng xác suất theo giả định độc lập, cực kỳ nhanh cho phân tích tức thời.',
    advanced: true,
  },
  {
    value: 'prophet',
    label: 'Prophet Time-Series',
    category: 'AI nâng cao',
    description: 'Mô hình dự báo thời gian theo xu hướng + mùa vụ, đặc biệt phù hợp chu kỳ xổ số.',
    advanced: true,
  },
];

const categories = Array.from(new Set(ALGORITHMS.map(item => item.category)));

interface AlgorithmSelectorProps {
  algorithm: string;
  topK: number;
  digits: number;
  lookback: number;
  advanced: boolean;
  onAlgorithmChange: (value: string) => void;
  onTopKChange: (value: number) => void;
  onDigitsChange: (value: number) => void;
  onLookbackChange: (value: number) => void;
  onAdvancedToggle: (value: boolean) => void;
}

export default function AlgorithmSelector({
  algorithm,
  topK,
  digits,
  lookback,
  advanced,
  onAlgorithmChange,
  onTopKChange,
  onDigitsChange,
  onLookbackChange,
  onAdvancedToggle,
}: AlgorithmSelectorProps) {
  const handleAlgorithmChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onAlgorithmChange(event.target.value);
  };

  const handleTopKChange = (event: ChangeEvent<HTMLInputElement>) => {
    onTopKChange(Number(event.target.value) || 1);
  };

  const handleDigitsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value) || 2;
    onDigitsChange(Math.min(Math.max(value, 1), 5));
  };

  const handleLookbackChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value) || 30;
    onLookbackChange(Math.max(value, 10));
  };

  const handleAdvancedToggle = (event: ChangeEvent<HTMLInputElement>) => {
    onAdvancedToggle(event.target.checked);
  };

  return (
    <div className="algorithm-selector">
      <div className="selector-group">
        <label>
          <span>Thuật toán</span>
          <select value={algorithm} onChange={handleAlgorithmChange}>
            {categories.map(category => (
              <optgroup key={category} label={category}>
                {ALGORITHMS.filter(item => item.category === category).map(item => {
                  const disabled = Boolean(item.advanced && !advanced);
                  const badge = item.badge ? ` [${item.badge}]` : '';
                  return (
                    <option key={item.value} value={item.value} disabled={disabled} title={item.description}>
                      {item.label}{badge}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          <span>Top-K</span>
          <input type="number" min={1} max={10} step={1} value={topK} onChange={handleTopKChange} />
        </label>
      </div>

      <div className="selector-group">
        <label>
          <span>Số chữ số cuối</span>
          <input type="number" min={1} max={5} step={1} value={digits} onChange={handleDigitsChange} />
        </label>
        <label>
          <span>Cửa sổ quan sát</span>
          <input type="number" min={10} max={500} step={10} value={lookback} onChange={handleLookbackChange} />
        </label>
      </div>

      <label className="advanced-toggle">
        <input type="checkbox" checked={advanced} onChange={handleAdvancedToggle} />
        <span className="toggle-track" />
        <span className="toggle-label">
          Chế độ nâng cao
          <small>Kích hoạt các thuật toán AI tính toán nặng</small>
        </span>
      </label>
    </div>
  );
}
