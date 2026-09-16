import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LivePrintVisualizer } from '@/components/customer/LivePrintVisualizer';

describe('truthful print status', () => {
  it('does not claim physical completion after spooler submission', () => {
    const html = renderToString(createElement(LivePrintVisualizer, { jobStatus: 'SUBMITTED' }));
    expect(html).toContain('Sent to printer');
    expect(html).toContain('physical completion is not confirmed');
    expect(html).not.toContain('Document Printed &amp; Ready!');
  });
  it('does not fabricate page progress during dispatch', () => {
    const html = renderToString(createElement(LivePrintVisualizer, { jobStatus: 'PRINTING', pageCount: 50 }));
    expect(html).toContain('Physical page progress is not available');
    expect(html).not.toContain('%');
  });
  it('shows cancellation even when a previous job status remains', () => {
    const html = renderToString(createElement(LivePrintVisualizer, { jobStatus: 'PENDING', orderStatus: 'CANCELLED' }));
    expect(html).toContain('Order cancelled');
    expect(html).not.toContain('Print stages');
  });
});
