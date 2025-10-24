import { formatDateShort } from '../utils/format';

interface HeaderProps {
  lastUpdated?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function Header({ lastUpdated, onRefresh, refreshing }: HeaderProps) {
  const formatted = lastUpdated ? formatDateShort(lastUpdated) : 'chưa xác định';
  return (
    <header style={{ paddingTop: '1.75rem' }}>
      <div className="badge">XS Miền Bắc Intelligence</div>
      <h1 style={{ fontSize: '2.75rem', marginTop: '1.25rem', lineHeight: 1.2 }}>
        Radar xổ số <span style={{ color: 'var(--accent)' }}>Miền Bắc</span>
      </h1>
      <p style={{ marginTop: '0.75rem', maxWidth: '60ch', color: 'var(--text-secondary)' }}>
        Giải mã dữ liệu xổ số bằng thống kê hiện đại, phát hiện xác suất nóng, và đưa ra gợi ý đầu số tiềm năng.
      </p>
      <div style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
        <span className="pulse">Dữ liệu real-time</span>
        <small>Cập nhật gần nhất: {formatted}</small>
        {onRefresh ? (
          <button className="ghost" onClick={onRefresh} type="button" disabled={refreshing}>
            {refreshing ? 'Đang đồng bộ…' : 'Tải mới toàn bộ dữ liệu'}
          </button>
        ) : null}
      </div>
    </header>
  );
}
