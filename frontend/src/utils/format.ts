export function formatDate(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return value.toLocaleDateString('vi-VN', {
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateShort(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return value.toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return value.toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
