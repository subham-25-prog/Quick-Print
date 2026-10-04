import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface PosterPdfOptions {
  shopName: string;
  shopAddress?: string;
  qrDataUrl: string;
}

/**
 * Generates an ultra-crisp, professionally styled 1-page A4 PDF poster
 * for shop counters, featuring a large scan-to-print QR code and step-by-step instructions.
 */
export async function generateShopPosterPdf({
  shopName,
  shopAddress,
  qrDataUrl,
}: PosterPdfOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  // Standard A4 dimensions in PDF points (72 DPI): 595.28 x 841.89
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const page = doc.addPage([pageWidth, pageHeight]);

  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  // Palette
  const colorIndigo = rgb(79 / 255, 70 / 255, 229 / 255); // #4f46e5
  const colorIndigoDark = rgb(67 / 255, 56 / 255, 202 / 255); // #4338ca
  const colorIndigoLight = rgb(238 / 255, 242 / 255, 255 / 255); // #eef2ff
  const colorIndigoBorder = rgb(199 / 255, 210 / 255, 254 / 255); // #c7d2fe
  const colorEmerald = rgb(16 / 255, 185 / 255, 129 / 255); // #10b981
  const colorSlate950 = rgb(15 / 255, 23 / 255, 42 / 255); // #0f172a
  const colorSlate700 = rgb(51 / 255, 65 / 255, 85 / 255); // #334155
  const colorSlate500 = rgb(100 / 255, 116 / 255, 139 / 255); // #64748b
  const colorSlate400 = rgb(148 / 255, 163 / 255, 184 / 255); // #94a3b8
  const colorCardBg = rgb(248 / 255, 250 / 255, 252 / 255); // #f8fafc
  const colorCardBorder = rgb(226 / 255, 232 / 255, 240 / 255); // #e2e8f0
  const colorWhite = rgb(1, 1, 1);

  const centerX = pageWidth / 2;

  // 1. Top Decorative Brand Bar
  page.drawRectangle({
    x: 0,
    y: pageHeight - 8,
    width: pageWidth,
    height: 8,
    color: colorIndigo,
  });

  // 2. Top Pill Badge: "SELF-SERVICE EXPRESS PRINT"
  const badgeWidth = 240;
  const badgeHeight = 26;
  const badgeY = 780;
  page.drawRectangle({
    x: centerX - badgeWidth / 2,
    y: badgeY,
    width: badgeWidth,
    height: badgeHeight,
    color: colorIndigo,
    borderWidth: 0,
  });

  const badgeText = 'SELF-SERVICE EXPRESS PRINT';
  const badgeTextSize = 10;
  const badgeTextWidth = fontBold.widthOfTextAtSize(badgeText, badgeTextSize);
  page.drawText(badgeText, {
    x: centerX - badgeTextWidth / 2,
    y: badgeY + 8,
    size: badgeTextSize,
    font: fontBold,
    color: colorWhite,
  });

  // 3. Shop Title
  const cleanTitle = shopName.trim() || 'QuickPrint Express';
  let titleSize = 26;
  let titleWidth = fontBold.widthOfTextAtSize(cleanTitle, titleSize);
  while (titleWidth > 500 && titleSize > 16) {
    titleSize -= 2;
    titleWidth = fontBold.widthOfTextAtSize(cleanTitle, titleSize);
  }

  const titleY = 735;
  page.drawText(cleanTitle, {
    x: centerX - titleWidth / 2,
    y: titleY,
    size: titleSize,
    font: fontBold,
    color: colorSlate950,
  });

  // 4. Shop Subtitle / Address
  const subtitle = (shopAddress || 'Shop Counter • Fast Document & Photo Printing').trim();
  const subSize = 11;
  const subWidth = fontRegular.widthOfTextAtSize(subtitle, subSize);
  const subY = titleY - 19;
  page.drawText(subtitle, {
    x: centerX - Math.min(subWidth, 500) / 2,
    y: subY,
    size: subSize,
    font: fontRegular,
    color: colorSlate500,
  });

  // 5. Large Prominent QR Code Box (Enhanced Size)
  const qrImage = await doc.embedPng(qrDataUrl);
  const qrBoxWidth = 320;
  const qrBoxHeight = 330;
  const qrBoxY = 360;

  // Background Box
  page.drawRectangle({
    x: centerX - qrBoxWidth / 2,
    y: qrBoxY,
    width: qrBoxWidth,
    height: qrBoxHeight,
    color: colorIndigoLight,
    borderColor: colorIndigoBorder,
    borderWidth: 2,
  });

  // White inner mat for QR code
  const qrSize = 250; // Noticeably large and prominent!
  const qrMatSize = qrSize + 14;
  page.drawRectangle({
    x: centerX - qrMatSize / 2,
    y: qrBoxY + 54,
    width: qrMatSize,
    height: qrMatSize,
    color: colorWhite,
    borderColor: colorCardBorder,
    borderWidth: 1,
  });

  // QR Code Image
  page.drawImage(qrImage, {
    x: centerX - qrSize / 2,
    y: qrBoxY + 61,
    width: qrSize,
    height: qrSize,
  });

  // QR Label Banner
  const qrLabel1 = 'SCAN TO UPLOAD & PRINT';
  const qrLabel1Size = 12;
  const qrLabel1Width = fontBold.widthOfTextAtSize(qrLabel1, qrLabel1Size);
  page.drawText(qrLabel1, {
    x: centerX - qrLabel1Width / 2,
    y: qrBoxY + 34,
    size: qrLabel1Size,
    font: fontBold,
    color: colorIndigoDark,
  });

  const qrLabel2 = 'Works directly in Mobile Browser • No App Needed';
  const qrLabel2Size = 9;
  const qrLabel2Width = fontRegular.widthOfTextAtSize(qrLabel2, qrLabel2Size);
  page.drawText(qrLabel2, {
    x: centerX - qrLabel2Width / 2,
    y: qrBoxY + 18,
    size: qrLabel2Size,
    font: fontRegular,
    color: colorSlate500,
  });

  // 6. 4 Step-by-Step Instructions
  const steps = [
    {
      num: '1',
      title: 'Scan QR Code',
      desc: 'Open Camera, Google Lens, or Paytm / PhonePe / GPay scanner',
      color: colorIndigo,
    },
    {
      num: '2',
      title: 'Upload Your Document',
      desc: 'Select PDF, Images, Govt ID, Notes, or Photos from your phone',
      color: colorIndigo,
    },
    {
      num: '3',
      title: 'Select Print Options',
      desc: 'Choose Color / B&W, copies, paper size & finishing add-ons',
      color: colorIndigo,
    },
    {
      num: '4',
      title: 'Instant UPI Payment & Collect',
      desc: 'Zero-touch automatic printing • Collect your prints at the counter',
      color: colorEmerald,
    },
  ];

  const stepsBoxWidth = 460;
  const stepRowHeight = 36;
  const stepGap = 7;
  const stepsStartY = qrBoxY - 20;

  steps.forEach((step, index) => {
    const rowY = stepsStartY - (index + 1) * (stepRowHeight + stepGap);

    // Row card background
    page.drawRectangle({
      x: centerX - stepsBoxWidth / 2,
      y: rowY,
      width: stepsBoxWidth,
      height: stepRowHeight,
      color: colorCardBg,
      borderColor: colorCardBorder,
      borderWidth: 1,
    });

    // Step number badge
    const badgeSize = 20;
    const badgeX = centerX - stepsBoxWidth / 2 + 10;
    const badgeCenterY = rowY + (stepRowHeight - badgeSize) / 2;
    page.drawRectangle({
      x: badgeX,
      y: badgeCenterY,
      width: badgeSize,
      height: badgeSize,
      color: step.color,
    });

    const numWidth = fontBold.widthOfTextAtSize(step.num, 10);
    page.drawText(step.num, {
      x: badgeX + (badgeSize - numWidth) / 2,
      y: badgeCenterY + 6,
      size: 10,
      font: fontBold,
      color: colorWhite,
    });

    // Step text
    const textStartX = badgeX + badgeSize + 10;
    page.drawText(step.title, {
      x: textStartX,
      y: rowY + 20,
      size: 10,
      font: fontBold,
      color: colorSlate950,
    });

    page.drawText(step.desc, {
      x: textStartX,
      y: rowY + 7,
      size: 8.5,
      font: fontRegular,
      color: colorSlate500,
    });
  });

  // 7. Divider Line & Footer
  const footerDividerY = 132;
  page.drawLine({
    start: { x: centerX - stepsBoxWidth / 2, y: footerDividerY },
    end: { x: centerX + stepsBoxWidth / 2, y: footerDividerY },
    thickness: 1,
    color: colorCardBorder,
  });

  const footerText1 = `Powered by ${cleanTitle} Self-Service System • High Speed Printing`;
  const footer1Size = 9;
  const footer1Width = fontBold.widthOfTextAtSize(footerText1, footer1Size);
  page.drawText(footerText1, {
    x: centerX - footer1Width / 2,
    y: footerDividerY - 20,
    size: footer1Size,
    font: fontBold,
    color: colorSlate700,
  });

  const footerText2 = 'Instant Express Pickup • Quality Guaranteed';
  const footer2Size = 8;
  const footer2Width = fontRegular.widthOfTextAtSize(footerText2, footer2Size);
  page.drawText(footerText2, {
    x: centerX - footer2Width / 2,
    y: footerDividerY - 33,
    size: footer2Size,
    font: fontRegular,
    color: colorSlate400,
  });

  // 8. Bottom Decorative Brand Bar
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: 8,
    color: colorIndigo,
  });

  return doc.save();
}

/**
 * Triggers a browser download of the generated poster PDF file.
 */
export function downloadPosterPdf(pdfBytes: Uint8Array, fileName: string) {
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
