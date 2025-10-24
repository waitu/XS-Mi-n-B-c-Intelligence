import type { NumberFrequency } from '../types';

interface NumberFrequencyListProps {
  data: NumberFrequency[];
}

export default function NumberFrequencyList({ data }: NumberFrequencyListProps) {
  if (data.length === 0) {
    return <small style={{ color: 'var(--text-secondary)' }}>Chưa có thống kê tần suất.</small>;
  }

  const max = Math.max(...data.map(item => item.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {data.map((item, index) => {
        const percent = max > 0 ? Math.round((item.count / max) * 100) : 0;
        return (
          <div key={item.number} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div className="badge-ghost" style={{ minWidth: '48px', textAlign: 'center' }}>
              #{index + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{item.number}</div>
              <div
                style={{
                  height: '6px',
                  borderRadius: '999px',
                  background: 'rgba(148, 163, 184, 0.2)',
                  overflow: 'hidden',
                  marginTop: '0.35rem',
                }}
              >
                <div
                  style={{
                    width: `${percent}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, rgba(249, 115, 22, 0.85), rgba(236, 72, 153, 0.85))`,
                    boxShadow: '0 0 10px rgba(249, 115, 22, 0.4)',
                  }}
                />
              </div>
            </div>
            <div style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{item.count}</div>
          </div>
        );
      })}
    </div>
  );
}
