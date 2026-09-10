'use client';

import React from 'react';
import { developerConfig } from '@/lib/config';

interface DeveloperBadgeProps {
  dark?: boolean;
  className?: string;
  variant?: 'card' | 'inline' | 'poster'; // For backward compatibility with existing prop calls
}

export const DeveloperBadge: React.FC<DeveloperBadgeProps> = ({
  dark = false,
  className = '',
}) => {
  return (
    <div className={`text-center py-2.5 select-none ${className}`}>
      <div
        className={`text-xs font-medium flex items-center justify-center gap-1.5 ${
          dark ? 'text-slate-400' : 'text-slate-500'
        }`}
      >
        <span>Made with</span>
        <span className="text-rose-500 inline-block text-sm leading-none">❤️</span>
        <span>by</span>
        <span className={`font-bold ${dark ? 'text-slate-200' : 'text-slate-800'}`}>
          {developerConfig.name}
        </span>
      </div>
      <div className="mt-0.5">
        <a
          href={`tel:${developerConfig.phone}`}
          className={`text-[11px] font-semibold tracking-wider transition-colors ${
            dark ? 'text-slate-500 hover:text-indigo-400' : 'text-slate-400 hover:text-indigo-600'
          }`}
        >
          {developerConfig.phone}
        </a>
      </div>
    </div>
  );
};
