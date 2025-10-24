import { FormEvent, useState, type ChangeEvent } from 'react';

interface IngestionPanelProps {
  onRefreshRange: (options: { startDate?: string; endDate?: string; force?: boolean }) => Promise<void>;
  onRefreshDay: (date: string, force: boolean) => Promise<void>;
  onRefreshMonth: (year: number, month: number, force: boolean) => Promise<void>;
  onRefreshYear: (year: number, force: boolean) => Promise<void>;
  busy: boolean;
}

export default function IngestionPanel({
  onRefreshRange,
  onRefreshDay,
  onRefreshMonth,
  onRefreshYear,
  busy,
}: IngestionPanelProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState(today);
  const [rangeForce, setRangeForce] = useState(true);

  const [dayValue, setDayValue] = useState('');
  const [dayForce, setDayForce] = useState(true);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const [monthValue, setMonthValue] = useState(currentMonth);
  const [monthForce, setMonthForce] = useState(false);

  const [yearValue, setYearValue] = useState(String(new Date().getFullYear()));
  const [yearForce, setYearForce] = useState(false);

  const handleRangeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onRefreshRange({
      startDate: rangeStart || undefined,
      endDate: rangeEnd || undefined,
      force: rangeForce,
    }).catch(() => undefined);
  };

  const handleDaySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!dayValue) return;
    await onRefreshDay(dayValue, dayForce).catch(() => undefined);
  };

  const handleMonthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!monthValue) return;
    const [yearStr, monthStr] = monthValue.split('-');
    await onRefreshMonth(Number(yearStr), Number(monthStr), monthForce).catch(() => undefined);
  };

  const handleYearSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const yearNumber = Number(yearValue);
    if (!Number.isFinite(yearNumber)) return;
    await onRefreshYear(yearNumber, yearForce).catch(() => undefined);
  };

  const handleCheckbox = (setter: (value: boolean) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    setter(event.target.checked);
  };

  return (
  <section className="glow-border" style={{ padding: '1.75rem' }}>
      <div className="section-title" style={{ marginBottom: '1.5rem' }}>
        Điều phối đồng bộ dữ liệu
        <span>Tùy chỉnh theo ngày, tháng, năm hoặc khoảng ngày</span>
      </div>

      <div className="grid-two">
        <form onSubmit={handleDaySubmit} className="glow-border" style={{ padding: '1.25rem', background: 'rgba(15,23,42,0.45)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.05rem' }}>Đồng bộ theo ngày</h3>
            <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input type="checkbox" checked={dayForce} onChange={handleCheckbox(setDayForce)} />
              Ghi đè
            </label>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem', marginTop: '0.5rem' }}>
            Kéo dữ liệu cho một ngày cụ thể.
          </p>
          <input
            type="date"
            value={dayValue}
            max={today}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setDayValue(event.target.value)}
            style={{ width: '100%', marginBottom: '0.75rem' }}
            required
          />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Đang đồng bộ…' : 'Đồng bộ ngày này'}
          </button>
        </form>

        <form onSubmit={handleMonthSubmit} className="glow-border" style={{ padding: '1.25rem', background: 'rgba(15,23,42,0.45)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.05rem' }}>Đồng bộ theo tháng</h3>
            <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input type="checkbox" checked={monthForce} onChange={handleCheckbox(setMonthForce)} />
              Ghi đè
            </label>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem', marginTop: '0.5rem' }}>
            Thu thập toàn bộ kỳ quay trong một tháng.
          </p>
          <input
            type="month"
            value={monthValue}
            max={currentMonth}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setMonthValue(event.target.value)}
            style={{ width: '100%', marginBottom: '0.75rem' }}
            required
          />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Đang đồng bộ…' : 'Đồng bộ tháng này'}
          </button>
        </form>
      </div>

      <div className="grid-two" style={{ marginTop: '1.5rem' }}>
        <form onSubmit={handleYearSubmit} className="glow-border" style={{ padding: '1.25rem', background: 'rgba(15,23,42,0.45)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.05rem' }}>Đồng bộ theo năm</h3>
            <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input type="checkbox" checked={yearForce} onChange={handleCheckbox(setYearForce)} />
              Ghi đè
            </label>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem', marginTop: '0.5rem' }}>
            Lấy toàn bộ dữ liệu trong cả năm dương lịch.
          </p>
          <input
            type="number"
            min="2000"
            max={String(new Date().getFullYear())}
            value={yearValue}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setYearValue(event.target.value)}
            style={{ width: '100%', marginBottom: '0.75rem' }}
            required
          />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Đang đồng bộ…' : 'Đồng bộ năm này'}
          </button>
        </form>

        <form onSubmit={handleRangeSubmit} className="glow-border" style={{ padding: '1.25rem', background: 'rgba(15,23,42,0.45)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.05rem' }}>Đồng bộ khoảng tuỳ chọn</h3>
            <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <input type="checkbox" checked={rangeForce} onChange={handleCheckbox(setRangeForce)} />
              Ghi đè
            </label>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem', marginTop: '0.5rem' }}>
            Phủ hết khoảng ngày mong muốn (ví dụ Tết Nguyên Đán).
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <label style={{ flex: 1, fontSize: '0.8rem' }}>
              Bắt đầu
              <input
                type="date"
                value={rangeStart}
                max={rangeEnd || today}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setRangeStart(event.target.value)}
                style={{ width: '100%', marginTop: '0.35rem' }}
              />
            </label>
            <label style={{ flex: 1, fontSize: '0.8rem' }}>
              Kết thúc
              <input
                type="date"
                value={rangeEnd}
                max={today}
                min={rangeStart || undefined}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setRangeEnd(event.target.value)}
                style={{ width: '100%', marginTop: '0.35rem' }}
                required
              />
            </label>
          </div>
          <button className="primary" type="submit" style={{ marginTop: '0.85rem' }} disabled={busy}>
            {busy ? 'Đang đồng bộ…' : 'Đồng bộ khoảng này'}
          </button>
        </form>
      </div>
    </section>
  );
}
