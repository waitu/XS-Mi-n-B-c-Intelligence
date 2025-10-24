import type { TailFrequency } from '../types';

interface TailHeatmapProps {
  data: TailFrequency[];
}

function getIntensity(value: number, max: number) {
  if (max === 0) return 0;
  return value / max;
}

export default function TailHeatmap({ data }: TailHeatmapProps) {
  if (data.length === 0) {
    return <small style={{ color: 'var(--text-secondary)' }}>Chưa có dữ liệu tần suất đuôi.</small>;
  }

  const max = Math.max(...data.map(item => item.count));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
      {data.map(item => {
        const intensity = getIntensity(item.count, max);
        const background = `linear-gradient(135deg, rgba(249, 115, 22, ${0.2 + intensity * 0.6}), rgba(56, 189, 248, ${0.2 + intensity * 0.5}))`;
        return (
          <div key={item.tail} className="glow-border" style={{ padding: '0.9rem', background }}>
            <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'rgba(248, 250, 252, 0.75)' }}>Đuôi</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 600 }}>{item.tail}</div>
            <small>{item.count.toLocaleString('vi-VN')} lần xuất hiện</small>
          </div>
        );
      })}
    </div>
  );
}
