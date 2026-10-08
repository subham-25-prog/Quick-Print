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

export function isCanvasStudioOrder(order: any): boolean {
  if (!order) return false;
  if (order.advanced_config?.isCanvaStudio) return true;
  if (order.advanced_config?.source === 'canva_studio') return true;
  if (order.isCanvaStudio) return true;
  const fileName = String(order.file_name || order.fileName || order.filename || '').toLowerCase();
  if (
    fileName === 'canva_studio_design.pdf' ||
    fileName.includes('canva_studio') ||
    fileName.includes('canvastudio') ||
    fileName.includes('canva') ||
    fileName.includes('canvas')
  ) {
    return true;
  }
  if (order.pricing_snapshot?.canvaStudioPages && Number(order.pricing_snapshot.canvaStudioPages) > 0) return true;
  if (order.canvaStudioPageCount && Number(order.canvaStudioPageCount) > 0) return true;
  if (order.canvaStudioPages && Number(order.canvaStudioPages) > 0) return true;
  if (order.add_ons?.canvaStudio || order.add_ons?.canvasStudio) return true;
  return false;
}
