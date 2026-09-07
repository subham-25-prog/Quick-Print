'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  
  const [checking, setChecking] = useState(pathname !== '/admin/login');
  const [isAuthorized, setIsAuthorized] = useState(pathname === '/admin/login');

  useEffect(() => {
    // If already on login page, let it render immediately
    if (pathname === '/admin/login') {
      setChecking(false);
      setIsAuthorized(true);
      return;
    }

    // Verify session via API in background
    fetch('/api/admin/auth', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setIsAuthorized(true);
          setChecking(false);
        } else {
          setIsAuthorized(false);
          setChecking(false);
          router.replace('/admin/login');
        }
      })
      .catch(() => {
        setIsAuthorized(false);
        setChecking(false);
        router.replace('/admin/login');
      });
  }, [pathname, router]);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (checking && !isAuthorized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-indigo-500/40 border-t-indigo-500 rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase">
            Verifying Admin Security PIN...
          </span>
        </div>
      </div>
    );
  }

  if(!isAuthorized)return null;
  return (
    <div className="min-h-screen flex flex-col bg-slate-100 font-sans transition-opacity duration-150">
      {children}
    </div>
  );
}

