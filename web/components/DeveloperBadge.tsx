'use client';

import React from 'react';
import { Phone, MessageSquare, Sparkles } from '@/components/ui/Icons';
import { developerConfig } from '@/lib/config';

interface DeveloperBadgeProps {
  variant?: 'card' | 'inline' | 'poster';
  className?: string;
}

export const DeveloperBadge: React.FC<DeveloperBadgeProps> = ({
  variant = 'card',
  className = '',
}) => {
  if (variant === 'inline') {
    return (
      <div className={`flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500 font-medium ${className}`}>
        <span>Software Developed by <strong className="text-slate-800 font-bold">{developerConfig.name}</strong></span>
        <span>•</span>
        <a
          href={`tel:${developerConfig.phone}`}
          className="text-indigo-600 hover:text-indigo-800 font-bold inline-flex items-center gap-1 hover:underline"
        >
          <Phone className="w-3 h-3" />
          <span>{developerConfig.formattedPhone}</span>
        </a>
      </div>
    );
  }

  if (variant === 'poster') {
    return (
      <div className={`p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200/80 text-center ${className}`}>
        <div className="text-[11px] font-bold text-slate-900 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3 h-3 text-indigo-600 shrink-0" />
          <span>Need this software for your cyber cafe or xerox shop?</span>
        </div>
        <div className="text-[10px] text-slate-600 font-medium mt-0.5 flex items-center justify-center gap-2">
          <span>Developed by <strong className="text-indigo-950 font-bold">{developerConfig.name}</strong></span>
          <span>•</span>
          <span className="font-bold text-indigo-700">Call/WhatsApp: {developerConfig.formattedPhone}</span>
        </div>
      </div>
    );
  }

  // Default 'card' variant for customer and admin pages
  return (
    <div className={`w-full rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 text-white border border-indigo-900/50 shadow-sm ${className}`}>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
        <div className="space-y-0.5">
          <div className="flex items-center justify-center sm:justify-start gap-1.5">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400">
              <Sparkles className="w-2.5 h-2.5" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
              System Creator &amp; Developer
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-200">
            Engineered &amp; Designed by <strong className="text-white font-black text-sm">{developerConfig.name}</strong>
          </p>
          <p className="text-[11px] text-slate-400">
            Want this self-service print system for your own shop? Get in touch today.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`tel:${developerConfig.phone}`}
            className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 border border-white/10 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
            title="Call Developer"
          >
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            <span>Call</span>
          </a>

          <a
            href={developerConfig.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm shadow-emerald-600/30 transition-all"
            title="Chat with Shubhamoy on WhatsApp"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>WhatsApp {developerConfig.formattedPhone}</span>
          </a>
        </div>
      </div>
    </div>
  );
};
