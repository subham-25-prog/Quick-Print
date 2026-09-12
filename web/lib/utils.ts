export function formatCurrency(amount: number | null | undefined, symbol = '₹'): string {
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `${symbol}${safeAmount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(dateString?: string): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
