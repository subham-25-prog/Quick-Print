'use client';

import React from 'react';
import { PriceBreakdown } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { Calculator, Tag } from '@/components/ui/Icons';

interface PriceSummaryProps {
  breakdown: PriceBreakdown;
  fileName?: string;
}

export const PriceSummary: React.FC<PriceSummaryProps> = ({ breakdown, fileName }) => {
  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">Price Breakdown</h3>
        </div>
        <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
          Live Rate
        </span>
      </div>

      <div className="space-y-2 text-xs text-slate-300">
        {/* Document details */}
        <div className="flex justify-between items-center text-slate-400">
          <span>Pages & Copies:</span>
          <span className="font-medium text-slate-200">
            {breakdown.pageCount} {breakdown.pageCount === 1 ? 'page' : 'pages'} × {breakdown.copies} {breakdown.copies === 1 ? 'copy' : 'copies'}
          </span>
        </div>

        {/* Base print cost */}
        <div className="flex justify-between items-center">
          <span>Printing ({formatCurrency(breakdown.effectiveRatePerPage)}/page):</span>
          <span className="font-semibold text-slate-100">{formatCurrency(breakdown.printSubtotal)}</span>
        </div>

        {/* Add-ons */}
        {breakdown.addOnsBreakdown.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center text-indigo-300">
            <span>+ {item.name}:</span>
            <span className="font-medium">{formatCurrency(item.total)}</span>
          </div>
        ))}
      </div>

      {/* Grand Total */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-baseline justify-between">
        <div>
          <div className="text-xs text-slate-400 font-medium">Total Amount</div>
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5">
            <Tag className="w-3 h-3" />
            <span>Inclusive of all taxes</span>
          </div>
        </div>
        <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {formatCurrency(breakdown.totalAmount)}
        </div>
      </div>
    </div>
  );
};
