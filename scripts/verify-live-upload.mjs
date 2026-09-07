// Creates one synthetic upload, never a payment or print order.
// Usage: node scripts/verify-live-upload.mjs https://your-shop.example
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
const base = new URL(process.argv[2]);
assert.equal(base.protocol, 'https:');
const request = (path, options = {}) => fetch(new URL(path, base), {
  ...options, signal: AbortSignal.timeout(30000), redirect: 'error',
});
const pricing = await request('/api/admin/pricing');
assert.equal(pricing.status, 200, 'Pricing endpoint must be healthy');
const readiness = await pricing.json();
console.log(JSON.stringify({ pricing: 'ok', checkoutEnabled: readiness.checkoutEnabled }));
const pdf = await PDFDocument.create();
pdf.addPage().drawText('QuickPrint installation verification. No payment or print requested.');
const form = new FormData();
form.set('file', new Blob([await pdf.save()], { type: 'application/pdf' }), 'quickprint-installation-check.pdf');
const upload = await request('/api/upload', { method: 'POST', headers: { origin: base.origin }, body: form });
const result = await upload.json();
assert.equal(upload.status, 200, `Upload failed: ${result.error || upload.status}`);
assert.equal(result.fileInfo.pageCount, 1);
const preview = new URL(result.fileInfo.signedUrl, base);
assert.equal(preview.origin, base.origin);
const authorized = await request(preview);
assert.equal(authorized.status, 200, 'Authorized preview must work');
assert.equal(Buffer.from(await authorized.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
preview.search = '';
const anonymous = await request(preview);
assert.ok([401, 403, 404].includes(anonymous.status), `Anonymous preview must be denied (received ${anonymous.status})`);
console.log(JSON.stringify({ upload: 'ok', pageCount: 1, authorizedPreview: 'ok', anonymousPreview: 'denied', paymentCreated: false, printRequested: false }));
