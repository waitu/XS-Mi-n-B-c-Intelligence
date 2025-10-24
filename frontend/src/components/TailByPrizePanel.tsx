import type { TailFrequencyGroup } from '../types';

interface TailByPrizePanelProps {
  data: TailFrequencyGroup[];
}

export default function TailByPrizePanel({ data }: TailByPrizePanelProps) {
  if (data.length === 0) {
    return <small style={{ color: 'var(--text-secondary)' }}>Chưa có dữ liệu tần suất theo từng giải.</small>;
  }

  return (
    <div className="tail-prize-grid">
      {data.map(group => (
        <div key={group.prize_name} className="tail-prize-card">
          <div className="tail-prize-card__header">
            <h4>{group.prize_name}</h4>
            <span className="badge-ghost">Rank {group.prize_rank}</span>
          </div>
          <ul className="tail-prize-list">
            {group.frequencies.map(item => (
              <li key={`${group.prize_name}-${item.tail}`}>
                <span className="tail-prize-list__tail">{item.tail}</span>
                <span className="tail-prize-list__count">{item.count.toLocaleString('vi-VN')} lần</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
