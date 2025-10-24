import type { SummaryStats } from '../types';
import { formatDateTime } from '../utils/format';

interface SummaryCardsProps {
  data: SummaryStats | null;
  variant?: 'default' | 'compact';
}

export default function SummaryCards({ data, variant = 'default' }: SummaryCardsProps) {
  if (!data) {
    return null;
  }

  const totalPrizes = Object.values(data.prizes_per_rank).reduce((acc, value) => acc + value, 0);
  const containerClass = variant === 'compact' ? 'summary-cards summary-cards--compact' : 'summary-cards';

  return (
    <section className={containerClass}>
      <article className="glow-border" style={{ padding: '1.5rem' }}>
        <div className="section-title" style={{ fontSize: '0.9rem', textTransform: 'uppercase' }}>
          Tổng số kỳ quay
        </div>
        <div style={{ fontSize: '2.4rem', fontWeight: 600 }}>{data.total_draws.toLocaleString('vi-VN')}</div>
        <small>Trọn bộ dữ liệu hiện có trong hệ thống</small>
      </article>

      <article className="glow-border" style={{ padding: '1.5rem' }}>
        <div className="section-title" style={{ fontSize: '0.9rem', textTransform: 'uppercase' }}>
          Lần đồng bộ gần nhất
        </div>
        <div style={{ fontSize: '1.45rem', fontWeight: 600 }}>
          {data.last_updated ? formatDateTime(data.last_updated) : 'Chưa có'}
        </div>
        <small>Cập nhật trực tiếp từ trang nguồn chính thức</small>
      </article>

      <article className="glow-border" style={{ padding: '1.5rem' }}>
        <div className="section-title" style={{ fontSize: '0.9rem', textTransform: 'uppercase' }}>
          Tổng số giải đã về
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 600 }}>{totalPrizes.toLocaleString('vi-VN')}</div>
        <small>Tổng số giải đã ghi nhận trên mọi kỳ quay</small>
      </article>
    </section>
  );
}
