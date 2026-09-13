import { AdvancedPrintConfig } from '@/types';

/**
 * Parses page range options and returns an ordered array of 0-based page indices.
 */
export function parsePageRange(
  totalDocPages: number,
  pageRangeMode?: string,
  customPageRange?: string
): number[] {
  if (!Number.isSafeInteger(totalDocPages) || totalDocPages <= 0) return [];

  const allIndices = Array.from({ length: totalDocPages }, (_, i) => i);

  if (pageRangeMode === 'ODD') {
    return allIndices.filter((i) => i % 2 === 0); // 1st, 3rd, 5th... (0, 2, 4...)
  }

  if (pageRangeMode === 'EVEN') {
    return allIndices.filter((i) => i % 2 === 1); // 2nd, 4th, 6th... (1, 3, 5...)
  }

  if (pageRangeMode === 'RANGE' && typeof customPageRange === 'string' && customPageRange.trim()) {
    const selected = new Set<number>();
    const segments = customPageRange.split(',');

    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!trimmed) continue;

      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        const start = parseInt(startStr?.trim() || '', 10);
        const end = parseInt(endStr?.trim() || '', 10);

        if (Number.isFinite(start) && Number.isFinite(end)) {
          const s = Math.max(1, Math.min(start, end));
          const e = Math.min(totalDocPages, Math.max(start, end));
          for (let p = s; p <= e; p++) {
            selected.add(p - 1);
          }
        }
      } else {
        const p = parseInt(trimmed, 10);
        if (Number.isFinite(p) && p >= 1 && p <= totalDocPages) {
          selected.add(p - 1);
        }
      }
    }

    const result = Array.from(selected).sort((a, b) => a - b);
    if (result.length > 0) return result;
  }

  return allIndices;
}

/**
 * Calculates the actual printed page count after applying page ranges and N-up imposition.
 */
export function computeEffectivePageCount(
  totalDocPages: number,
  config?: AdvancedPrintConfig
): number {
  if (!Number.isSafeInteger(totalDocPages) || totalDocPages <= 0) return 1;
  if (!config) return totalDocPages;

  const indices = parsePageRange(totalDocPages, config.pageRangeMode, config.customPageRange);
  const selectedCount = Math.max(1, indices.length);

  const nUp = config.pagesPerSheet === '2' ? 2 : config.pagesPerSheet === '4' ? 4 : 1;
  return Math.max(1, Math.ceil(selectedCount / nUp));
}
