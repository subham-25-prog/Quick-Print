import { PDFDocument, rgb, degrees, StandardFonts, PDFPage } from 'pdf-lib';
import { AdvancedPrintConfig } from '@/types';
import { parsePageRange, computeEffectivePageCount } from './page-range';

export { parsePageRange, computeEffectivePageCount };

/**
 * Transforms a PDF according to the given AdvancedPrintConfig:
 * - Extracts selected page range
 * - Handles N-up sheet imposition (2 or 4 pages per sheet)
 * - Adjusts orientation (Portrait / Landscape)
 * - Applies watermark stamps
 */
export async function transformPdf(
  rawBuffer: Buffer | Uint8Array,
  config?: AdvancedPrintConfig
): Promise<Buffer> {
  if (!config) {
    return Buffer.from(rawBuffer);
  }

  const {
    pageRangeMode,
    customPageRange,
    pagesPerSheet = '1',
    orientation = 'AUTO',
    watermark = 'NONE',
  } = config;

  const isDefault =
    (!pageRangeMode || pageRangeMode === 'ALL') &&
    pagesPerSheet === '1' &&
    (!orientation || orientation === 'AUTO') &&
    (!watermark || watermark === 'NONE');

  if (isDefault) {
    return Buffer.from(rawBuffer);
  }

  const srcDoc = await PDFDocument.load(rawBuffer, {
    throwOnInvalidObject: false,
    updateMetadata: false,
  });

  const totalPages = srcDoc.getPageCount();
  const selectedIndices = parsePageRange(totalPages, pageRangeMode, customPageRange);

  if (selectedIndices.length === 0) {
    return Buffer.from(rawBuffer);
  }

  const dstDoc = await PDFDocument.create();

  if (pagesPerSheet === '2' || pagesPerSheet === '4') {
    // N-Up imposition: embed selected pages into unified composite sheets
    const embeddedPages = await dstDoc.embedPdf(srcDoc, selectedIndices);
    const nUp = pagesPerSheet === '2' ? 2 : 4;

    // Standard A4 dimensions in points (595.28 x 841.89)
    // 2-up uses Landscape A4; 4-up uses Portrait A4
    const sheetW = nUp === 2 ? 841.89 : 595.28;
    const sheetH = nUp === 2 ? 595.28 : 841.89;

    const totalCompositeSheets = Math.ceil(embeddedPages.length / nUp);

    for (let s = 0; s < totalCompositeSheets; s++) {
      const sheet = dstDoc.addPage([sheetW, sheetH]);

      if (nUp === 2) {
        // 2-up: Side-by-side on Landscape A4
        const slotW = (sheetW - 30) / 2;
        const slotH = sheetH - 20;

        for (let i = 0; i < 2; i++) {
          const pageIdx = s * 2 + i;
          if (pageIdx >= embeddedPages.length) break;
          const embedded = embeddedPages[pageIdx];

          const scale = Math.min(slotW / embedded.width, slotH / embedded.height) * 0.95;
          const dw = embedded.width * scale;
          const dh = embedded.height * scale;
          const dx = 10 + i * (slotW + 10) + (slotW - dw) / 2;
          const dy = 10 + (slotH - dh) / 2;

          sheet.drawPage(embedded, { x: dx, y: dy, width: dw, height: dh });
        }
      } else {
        // 4-up: 2x2 grid on Portrait A4
        const slotW = (sheetW - 30) / 2;
        const slotH = (sheetH - 30) / 2;

        for (let i = 0; i < 4; i++) {
          const pageIdx = s * 4 + i;
          if (pageIdx >= embeddedPages.length) break;
          const embedded = embeddedPages[pageIdx];

          const col = i % 2;
          const row = 1 - Math.floor(i / 2); // row 1 is top, row 0 is bottom

          const scale = Math.min(slotW / embedded.width, slotH / embedded.height) * 0.95;
          const dw = embedded.width * scale;
          const dh = embedded.height * scale;
          const dx = 10 + col * (slotW + 10) + (slotW - dw) / 2;
          const dy = 10 + row * (slotH + 10) + (slotH - dh) / 2;

          sheet.drawPage(embedded, { x: dx, y: dy, width: dw, height: dh });
        }
      }
    }
  } else {
    // 1-up: copy selected pages directly
    const copiedPages = await dstDoc.copyPages(srcDoc, selectedIndices);
    for (const page of copiedPages) {
      dstDoc.addPage(page);
    }
  }

  // Adjust page orientation if specified
  if (orientation === 'LANDSCAPE' || orientation === 'PORTRAIT') {
    const pages = dstDoc.getPages();
    for (const page of pages) {
      const { width, height } = page.getSize();
      const currentRotation = page.getRotation().angle;
      const isLandscape = (currentRotation % 180 === 0) ? width > height : height > width;

      if (orientation === 'LANDSCAPE' && !isLandscape) {
        page.setRotation(degrees((currentRotation + 90) % 360));
      } else if (orientation === 'PORTRAIT' && isLandscape) {
        page.setRotation(degrees((currentRotation + 90) % 360));
      }
    }
  }

  // Apply watermark stamp if selected
  if (watermark && watermark !== 'NONE') {
    const font = await dstDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = dstDoc.getPages();

    for (const page of pages) {
      applyWatermarkToPage(page, watermark, font);
    }
  }

  const savedBytes = await dstDoc.save({ useObjectStreams: false });
  return Buffer.from(savedBytes);
}

function applyWatermarkToPage(
  page: PDFPage,
  text: string,
  font: any
) {
  const { width, height } = page.getSize();
  const fontSize = Math.max(28, Math.min(64, Math.round(width * 0.1)));
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const textHeight = font.heightAtSize(fontSize);

  // Position at center rotated 45 degrees
  const rad = Math.PI / 4;
  const cx = width / 2;
  const cy = height / 2;
  const x = cx - (textWidth / 2) * Math.cos(rad) + (textHeight / 2) * Math.sin(rad);
  const y = cy - (textWidth / 2) * Math.sin(rad) - (textHeight / 2) * Math.cos(rad);

  page.drawText(text, {
    x,
    y,
    size: fontSize,
    font,
    color: rgb(0.85, 0.2, 0.2),
    opacity: 0.22,
    rotate: degrees(45),
  });
}
