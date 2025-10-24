interface LoadingStateProps {
  message?: string;
}

export default function LoadingState({ message }: LoadingStateProps) {
  return (
    <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <div className="pulse">Đang phân tích dữ liệu…</div>
      <small style={{ display: 'block', marginTop: '0.75rem' }}>{message ?? 'Chờ một chút để lấy dữ liệu mới nhất.'}</small>
    </div>
  );
}
