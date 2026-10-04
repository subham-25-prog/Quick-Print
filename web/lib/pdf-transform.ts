import { PDFDocument, rgb, degrees, StandardFonts, PDFPage } from 'pdf-lib';
import { AdvancedPrintConfig } from '@/types';
import { parsePageRange, computeEffectivePageCount } from './page-range';

export { parsePageRange, computeEffectivePageCount };

export interface TransformPdfOptions {
  paperSize?: string;
  colorMode?: 'BW' | 'COLOR';
}

function getPaperDimensions(paperSize?: string): [number, number] {
  const norm = (paperSize || 'A4').toUpperCase();
  if (norm === 'A3' || norm === 'TABLOID') {
    return [841.89, 1190.55];
  }
  if (norm === 'LEGAL') {
    return [612.0, 1008.0];
  }
  if (norm === 'LETTER') {
    return [612.0, 792.0];
  }
  // Default A4 dimensions in PostScript points (595.28 x 841.89)
  return [595.28, 841.89];
}

/**
 * Transforms a PDF according to the given AdvancedPrintConfig:
 * - Extracts selected page range
 * - Handles N-up sheet imposition (1, 2, or 4 pages per sheet)
 * - Handles page scaling (FIT, ACTUAL, or CUSTOM percentage)
 * - Adjusts orientation (Portrait / Landscape) and user rotation angle (0, 90, 180, 270)
 * - Applies watermark stamps
 */
export async function transformPdf(
  rawBuffer: Buffer | Uint8Array,
  config?: AdvancedPrintConfig,
  options?: TransformPdfOptions
): Promise<Buffer> {
  if (!config) {
    return Buffer.from(rawBuffer);
  }

  const {
    pageRangeMode,
    customPageRange,
    pagesPerSheet = '1',
    pageScaling = 'FIT',
    customScalePercent = 100,
    orientation = 'AUTO',
    rotationAngle = 0,
    watermark = 'NONE',
  } = config;

  const isDefault =
    (!pageRangeMode || pageRangeMode === 'ALL') &&
    pagesPerSheet === '1' &&
    (!pageScaling || pageScaling === 'FIT' || (pageScaling === 'CUSTOM' && customScalePercent === 100)) &&
    (!orientation || orientation === 'AUTO') &&
    (!rotationAngle || rotationAngle === 0) &&
    (!watermark || watermark === 'NONE') &&
    (!options?.paperSize || options.paperSize === 'A4');

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
  const [basePaperW, basePaperH] = getPaperDimensions(options?.paperSize);

  if (pagesPerSheet === '2' || pagesPerSheet === '4') {
    // N-Up imposition: embed selected pages into composite sheets
    const embeddedPages = await dstDoc.embedPdf(srcDoc, selectedIndices);
    const nUp = pagesPerSheet === '2' ? 2 : 4;

    // Determine composite sheet dimensions
    let sheetW: number;
    let sheetH: number;

    if (nUp === 2) {
      if (orientation === 'PORTRAIT') {
        // Portrait 2-up: 2 stacked slots on Portrait sheet (top & bottom)
        sheetW = Math.min(basePaperW, basePaperH);
        sheetH = Math.max(basePaperW, basePaperH);
      } else {
        // Landscape 2-up (default for 2-up): 2 side-by-side slots on Landscape sheet
        sheetW = Math.max(basePaperW, basePaperH);
        sheetH = Math.min(basePaperW, basePaperH);
      }
    } else {
      // 4-up (2x2 grid): Portrait by default, or Landscape if requested
      if (orientation === 'LANDSCAPE') {
        sheetW = Math.max(basePaperW, basePaperH);
        sheetH = Math.min(basePaperW, basePaperH);
      } else {
        sheetW = Math.min(basePaperW, basePaperH);
        sheetH = Math.max(basePaperW, basePaperH);
      }
    }

    const totalCompositeSheets = Math.ceil(embeddedPages.length / nUp);
    const scaleMultiplier =
      pageScaling === 'CUSTOM'
        ? Math.min(2.0, Math.max(0.2, (customScalePercent || 100) / 100))
        : 0.95;

    for (let s = 0; s < totalCompositeSheets; s++) {
      const sheet = dstDoc.addPage([sheetW, sheetH]);

      if (nUp === 2) {
        if (orientation === 'PORTRAIT') {
          // 2-up stacked vertically (top and bottom)
          const slotW = sheetW - 24;
          const slotH = (sheetH - 30) / 2;

          for (let i = 0; i < 2; i++) {
            const pageIdx = s * 2 + i;
            if (pageIdx >= embeddedPages.length) break;
            const embedded = embeddedPages[pageIdx];

            const baseScale = Math.min(slotW / embedded.width, slotH / embedded.height);
            const scale = baseScale * scaleMultiplier;
            const dw = embedded.width * scale;
            const dh = embedded.height * scale;

            const dx = 12 + (slotW - dw) / 2;
            // i=0 is top slot (higher y), i=1 is bottom slot (lower y)
            const slotBaseY = i === 0 ? sheetH / 2 + 5 : 10;
            const dy = slotBaseY + (slotH - dh) / 2;

            sheet.drawPage(embedded, { x: dx, y: dy, width: dw, height: dh });
          }
        } else {
          // 2-up side-by-side (left and right) on Landscape sheet
          const slotW = (sheetW - 30) / 2;
          const slotH = sheetH - 24;

          for (let i = 0; i < 2; i++) {
            const pageIdx = s * 2 + i;
            if (pageIdx >= embeddedPages.length) break;
            const embedded = embeddedPages[pageIdx];

            const baseScale = Math.min(slotW / embedded.width, slotH / embedded.height);
            const scale = baseScale * scaleMultiplier;
            const dw = embedded.width * scale;
            const dh = embedded.height * scale;

            const dx = 10 + i * (slotW + 10) + (slotW - dw) / 2;
            const dy = 12 + (slotH - dh) / 2;

            sheet.drawPage(embedded, { x: dx, y: dy, width: dw, height: dh });
          }
        }
      } else {
        // 4-up: 2x2 grid
        const slotW = (sheetW - 30) / 2;
        const slotH = (sheetH - 30) / 2;

        for (let i = 0; i < 4; i++) {
          const pageIdx = s * 4 + i;
          if (pageIdx >= embeddedPages.length) break;
          const embedded = embeddedPages[pageIdx];

          const col = i % 2;
          const row = 1 - Math.floor(i / 2); // row 1 is top, row 0 is bottom

          const baseScale = Math.min(slotW / embedded.width, slotH / embedded.height);
          const scale = baseScale * scaleMultiplier;
          const dw = embedded.width * scale;
          const dh = embedded.height * scale;

          const dx = 10 + col * (slotW + 10) + (slotW - dw) / 2;
          const dy = 10 + row * (slotH + 10) + (slotH - dh) / 2;

          sheet.drawPage(embedded, { x: dx, y: dy, width: dw, height: dh });
        }
      }
    }
  } else if (pageScaling === 'CUSTOM' && customScalePercent !== 100) {
    // 1-up with custom scaling: embed page and draw scaled onto target sheet
    const embeddedPages = await dstDoc.embedPdf(srcDoc, selectedIndices);
    const isLandscape = orientation === 'LANDSCAPE';
    const sheetW = isLandscape ? Math.max(basePaperW, basePaperH) : Math.min(basePaperW, basePaperH);
    const sheetH = isLandscape ? Math.min(basePaperW, basePaperH) : Math.max(basePaperW, basePaperH);
    const scaleFactor = Math.min(2.0, Math.max(0.2, (customScalePercent || 100) / 100));

    for (const embedded of embeddedPages) {
      const sheet = dstDoc.addPage([sheetW, sheetH]);
      const baseScale = Math.min(sheetW / embedded.width, sheetH / embedded.height);
      const scale = baseScale * scaleFactor;
      const dw = embedded.width * scale;
      const dh = embedded.height * scale;
      const dx = (sheetW - dw) / 2;
      const dy = (sheetH - dh) / 2;

      sheet.drawPage(embedded, { x: dx, y: dy, width: dw, height: dh });
    }
  } else {
    // 1-up standard: copy selected pages directly
    const copiedPages = await dstDoc.copyPages(srcDoc, selectedIndices);
    for (const page of copiedPages) {
      dstDoc.addPage(page);
    }

    // Adjust page orientation if specified
    if (orientation === 'LANDSCAPE' || orientation === 'PORTRAIT') {
      const pages = dstDoc.getPages();
      for (const page of pages) {
        const { width, height } = page.getSize();
        const currentRotation = page.getRotation().angle;
        const isLandscape = currentRotation % 180 === 0 ? width > height : height > width;

        if (orientation === 'LANDSCAPE' && !isLandscape) {
          page.setRotation(degrees((currentRotation + 90) % 360));
        } else if (orientation === 'PORTRAIT' && isLandscape) {
          page.setRotation(degrees((currentRotation + 90) % 360));
        }
      }
    }
  }

  // Apply manual rotation angle chosen from preview (0, 90, 180, 270)
  if (rotationAngle && rotationAngle !== 0) {
    const pages = dstDoc.getPages();
    for (const page of pages) {
      const currentRot = page.getRotation().angle;
      page.setRotation(degrees((currentRot + rotationAngle) % 360));
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

function applyWatermarkToPage(page: PDFPage, text: string, font: any) {
  const { width, height } = page.getSize();
  const fontSize = Math.max(28, Math.min(64, Math.round(width * 0.08)));
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
