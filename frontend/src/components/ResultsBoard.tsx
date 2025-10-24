import type { Draw } from '../types';
import { formatDate } from '../utils/format';

interface ResultsBoardProps {
  draws: Draw[];
}

function formatPrizeName(prizeName: string, rank: number) {
  return prizeName || `Giải ${rank}`;
}

export default function ResultsBoard({ draws }: ResultsBoardProps) {
  if (draws.length === 0) {
    return <small style={{ color: 'var(--text-secondary)' }}>Chưa có kỳ quay nào.</small>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      {draws.map(draw => (
        <article key={draw.draw_date} className="glow-border" style={{ padding: '1.25rem 1.5rem' }}>
          <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div>
              <div className="badge-ghost" style={{ marginBottom: '0.35rem' }}>
                {formatDate(draw.draw_date)}
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>Kết quả chính thức</div>
            </div>
            {draw.source_url ? (
              <a
                href={draw.source_url}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)', fontSize: '0.85rem' }}
              >
                Xem nguồn
              </a>
            ) : null}
          </header>
          <div style={{ marginTop: '1rem', display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            {draw.prizes.map(prize => (
              <div
                key={`${prize.prize_rank}-${prize.position}`}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  padding: '0.75rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(148, 163, 184, 0.12)',
                }}
              >
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  {formatPrizeName(prize.prize_name, prize.prize_rank)}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 600, marginTop: '0.25rem' }}>{prize.number}</div>
                <small>Vị trí #{prize.position + 1}</small>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
