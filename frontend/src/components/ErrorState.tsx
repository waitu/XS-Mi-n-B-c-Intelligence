interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div style={{ padding: '1.75rem', textAlign: 'center' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'rgb(248, 113, 113)' }}>
        Đã có lỗi khi tải dữ liệu
      </div>
      <small style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
        {message ?? 'Vui lòng thử lại sau ít phút.'}
      </small>
      {onRetry ? (
        <button className="primary" onClick={onRetry} type="button">
          Thử lại
        </button>
      ) : null}
    </div>
  );
}
