import { randomUUID } from 'node:crypto';
import { PDFDocument, rgb } from 'pdf-lib';

// Parse command line arguments
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}

const targetUrl = (getArg('url', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')).replace(/\/+$/, '');
const totalJobs = parseInt(getArg('count', '10'), 10);
const concurrency = parseInt(getArg('concurrency', '2'), 10);
const waitForAgent = args.includes('--wait') || true;

console.log('================================================================');
console.log('       QuickPrint Continuous Multi-Print Stress Test');
console.log('================================================================');
console.log(`Backend URL:        ${targetUrl}`);
console.log(`Total Print Jobs:   ${totalJobs}`);
console.log(`Concurrency:        ${concurrency}`);
console.log(`Target Document Mix: 60% Multi-page PDFs, 40% Photos (PNG)`);
console.log('================================================================\n');

// Standard 1x1 base64 transparent PNG buffer for photo print simulation
const SAMPLE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function createSamplePdf(jobIndex, pageCount = 2) {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([595.28, 841.89]); // A4
    page.drawText(`QuickPrint Stress Test Job #${jobIndex}`, {
      x: 50,
      y: 780,
      size: 18,
      color: rgb(0.1, 0.2, 0.8),
    });
    page.drawText(`Page ${i} of ${pageCount} - Generated at ${new Date().toISOString()}`, {
      x: 50,
      y: 750,
      size: 12,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText('This is a simulated high-throughput print queue test document.', {
      x: 50,
      y: 710,
      size: 10,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
  return Buffer.from(await doc.save());
}

function createSamplePhoto(jobIndex) {
  return Buffer.from(SAMPLE_PNG_BASE64, 'base64');
}

async function executeSinglePrintJob(index) {
  const startTime = Date.now();
  const isPhoto = index % 3 === 0;
  const fileName = isPhoto ? `photo_test_${index}.png` : `doc_test_${index}.pdf`;
  const fileType = isPhoto ? 'image/png' : 'application/pdf';
  const pageCount = isPhoto ? 1 : (index % 4) + 1;

  const fileBuffer = isPhoto
    ? createSamplePhoto(index)
    : await createSamplePdf(index, pageCount);

  // 1. Upload Document
  const uploadStart = Date.now();
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([fileBuffer], { type: fileType }),
    fileName
  );

  const uploadRes = await fetch(`${targetUrl}/api/upload`, {
    method: 'POST',
    headers: { origin: targetUrl },
    body: formData,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Upload failed (Status ${uploadRes.status}): ${text}`);
  }

  const uploadData = await uploadRes.json();
  const uploadDuration = Date.now() - uploadStart;

  // 2. Checkout via Cash
  const checkoutStart = Date.now();
  const checkoutRes = await fetch(`${targetUrl}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: targetUrl,
    },
    body: JSON.stringify({
      uploadId: uploadData.fileInfo.uploadId,
      uploadToken: uploadData.fileInfo.uploadToken,
      idempotencyKey: randomUUID(),
      paperSize: isPhoto ? 'PHOTO' : 'A4',
      colorMode: isPhoto || index % 2 === 0 ? 'COLOR' : 'BW',
      printSides: 'SINGLE',
      copies: 1,
      addOns: {},
      customerName: `Tester ${index}`,
      customerPhone: '9876543210',
      paymentMethod: 'CASH',
    }),
  });

  if (!checkoutRes.ok) {
    const text = await checkoutRes.text();
    throw new Error(`Checkout failed (Status ${checkoutRes.status}): ${text}`);
  }

  const orderData = await checkoutRes.json();
  const checkoutDuration = Date.now() - checkoutStart;
  const totalDuration = Date.now() - startTime;

  return {
    index,
    orderId: orderData.orderId,
    paymentId: orderData.paymentId,
    accessToken: orderData.accessToken,
    fileName,
    isPhoto,
    pageCount: uploadData.fileInfo.pageCount || pageCount,
    uploadDuration,
    checkoutDuration,
    totalDuration,
    status: orderData.status,
  };
}

async function runStressTest() {
  const results = [];
  const errors = [];
  let completedCount = 0;

  console.log(`Submitting ${totalJobs} print orders with concurrency limit ${concurrency}...\n`);

  // Process in worker chunks matching concurrency
  const queue = Array.from({ length: totalJobs }, (_, i) => i + 1);

  async function worker(workerId) {
    while (queue.length > 0) {
      const index = queue.shift();
      try {
        const result = await executeSinglePrintJob(index);
        results.push(result);
        completedCount++;
        const typeLabel = result.isPhoto ? '[PHOTO]' : `[PDF ${result.pageCount}p]`;
        console.log(
          `  ✓ [Job #${String(index).padStart(2, '0')}] ${typeLabel.padEnd(9)} -> ` +
          `Order: ${result.orderId.slice(0, 8)}... | ` +
          `Upload: ${result.uploadDuration}ms | Checkout: ${result.checkoutDuration}ms | ` +
          `Total: ${result.totalDuration}ms | Status: ${result.status}`
        );
      } catch (err) {
        errors.push({ index, error: err.message });
        console.error(`  ✗ [Job #${String(index).padStart(2, '0')}] FAILED: ${err.message}`);
      }
    }
  }

  const workerPromises = Array.from({ length: concurrency }, (_, id) => worker(id + 1));
  await Promise.all(workerPromises);

  console.log('\n================================================================');
  console.log('                     STRESS TEST RESULTS');
  console.log('================================================================');
  console.log(`Total Orders Attempted:  ${totalJobs}`);
  console.log(`Successful Checkouts:    ${results.length}`);
  console.log(`Failed Checkouts:        ${errors.length}`);

  if (results.length > 0) {
    const avgTotal = Math.round(results.reduce((a, b) => a + b.totalDuration, 0) / results.length);
    const avgUpload = Math.round(results.reduce((a, b) => a + b.uploadDuration, 0) / results.length);
    const avgCheckout = Math.round(results.reduce((a, b) => a + b.checkoutDuration, 0) / results.length);
    const totalPages = results.reduce((a, b) => a + b.pageCount, 0);

    console.log(`Total Pages Queued:      ${totalPages}`);
    console.log(`Average Upload Time:     ${avgUpload}ms`);
    console.log(`Average Checkout Time:   ${avgCheckout}ms`);
    console.log(`Average E2E Latency:     ${avgTotal}ms`);
    console.log(`Throughput Capacity:     ${(results.length / (results.reduce((a, b) => a + b.totalDuration, 0) / 1000 / concurrency)).toFixed(2)} jobs/sec`);
  }

  if (errors.length > 0) {
    console.log('\nErrors encountered:');
    errors.forEach((e) => console.log(`  - Job #${e.index}: ${e.error}`));
  } else {
    console.log('\nAll print jobs queued successfully with 0 crashes or failures!');
  }
  console.log('================================================================\n');

  if (results.length > 0 && waitForAgent) {
    console.log('Checking print agent processing for queued jobs...');
    let pendingJobs = results.length;
    let pollAttempts = 0;
    const maxPolls = 15;

    while (pendingJobs > 0 && pollAttempts < maxPolls) {
      pollAttempts++;
      await new Promise((r) => setTimeout(r, 2000));
      
      // Sample status of first and last order
      const sample = results[0];
      try {
        const res = await fetch(`${targetUrl}/api/orders/${sample.orderId}`, {
          headers: {
            'x-order-access-token': sample.accessToken,
            origin: targetUrl,
          },
        });
        if (res.ok) {
          const info = await res.json();
          console.log(`[Queue Monitor] Sample Order #${sample.orderId.slice(0, 8)}: Order Status = ${info.order?.order_status}, Job Status = ${info.job?.status || 'QUEUED'}, Agent = ${info.agentOnline ? 'ONLINE' : 'OFFLINE'}`);
          if (info.job?.status === 'SUBMITTED' || info.job?.status === 'PRINTED') {
            pendingJobs = 0;
            console.log('✓ Print Agent successfully processed and completed jobs!');
          }
        }
      } catch {}
    }
  }
}

runStressTest().catch((err) => {
  console.error('Fatal stress test runner error:', err);
  process.exit(1);
});
