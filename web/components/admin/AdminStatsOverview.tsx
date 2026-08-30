'use client';

import React from 'react';
import { Order } from '@/types';
import { Clock, Printer, CheckCircle2, AlertCircle, ShoppingCart } from '@/components/ui/Icons';

interface AdminStatsOverviewProps {
  orders: Order[];
}

export const AdminStatsOverview: React.FC<AdminStatsOverviewProps> = ({ orders }) => {
  const pendingPayment = orders.filter((o) =>
    ['PAYMENT_VERIFICATION_PENDING', 'PENDING_PAYMENT'].includes(o.order_status)
  ).length;

  const approved = orders.filter((o) => o.order_status === 'APPROVED').length;
  const printing = orders.filter((o) => o.order_status === 'PRINTING').length;
  const completed = orders.filter((o) => o.order_status === 'PRINTED').length;

  const totalRevenue = orders
    .filter((o) => o.order_status === 'PRINTED' || o.payment_status === 'VERIFIED')
    .reduce((sum, o) => sum + (o.total_amount || 0), 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* 1. Pending Verification */}
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-300">Needs Verification</span>
          <Clock className="w-4 h-4 text-amber-400" />
        </div>
        <div className="text-2xl font-extrabold text-amber-100 mt-2">{pendingPayment}</div>
      </div>

      {/* 2. Ready to Print */}
      <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-indigo-300">In Spooler</span>
          <Printer className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="text-2xl font-extrabold text-indigo-100 mt-2">{approved + printing}</div>
      </div>

      {/* 3. Completed Prints */}
      <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-emerald-300">Printed Today</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="text-2xl font-extrabold text-emerald-100 mt-2">{completed}</div>
      </div>

      {/* 4. Total Orders */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400">Total Orders</span>
          <ShoppingCart className="w-4 h-4 text-slate-400" />
        </div>
        <div className="text-2xl font-extrabold text-white mt-2">{orders.length}</div>
      </div>
    </div>
  );
};
