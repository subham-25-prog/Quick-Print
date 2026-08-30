'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Printer, CheckCircle2, RefreshCw, FileText, Zap, ArrowLeft, Play, Pause } from '@/components/ui/Icons';
import { formatCurrency, formatDate } from '@/lib/utils';

interface SimJob {
  job_id: string;
  order_id: string;
  order_number: string;
  file_name: string;
  file_type: string;
  download_url: string;
  page_count: number;
  copies: number;
  paper_size: string;
  color_mode: string;
  print_sides: string;
}

export default function DigitalPrinterSimulatorPage() {
  const [isActive, setIsActive] = useState(true);
  const [status, setStatus] = useState<'IDLE' | 'CLAIMING' | 'PRINTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [currentJob, setCurrentJob] = useState<SimJob | null>(null);
  const [printedCount, setPrintedCount] = useState(0);
  const [printedHistory, setPrintedHistory] = useState<SimJob[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // Heartbeat loop
  useEffect(() => {
    if (!isActive) return;

    const sendHeartbeat = async () => {
      try {
        await fetch('/api/agent/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'agent-digital-simulator',
            printerName: 'CloudPrint Virtual Digital Printer (Web)',
            systemInfo: 'QuickPrint Browser Simulator v1.0',
          }),
        });
      } catch (e) {}
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10000);
    return () => clearInterval(interval);
  }, [isActive]);

  // Polling loop for approved jobs
  useEffect(() => {
    if (!isActive || status === 'PRINTING') return;

    const checkJobs = async () => {
      try {
        const res = await fetch('/api/agent/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: 'agent-digital-simulator' }),
        });

        const data = await res.json();
        if (data.job) {
          const job: SimJob = data.job;
          setCurrentJob(job);
          setStatus('PRINTING');
          addLog(`Claimed Job #${job.order_number} (${job.file_name}) - ${job.copies} copy x ${job.page_count} pages [${job.paper_size}]`);
          
          // Simulate printing progress
          let currentProgress = 0;
          setProgress(0);

          const progressInterval = setInterval(() => {
            currentProgress += 20;
            setProgress(currentProgress);
            if (currentProgress >= 100) {
              clearInterval(progressInterval);
              
              // Mark complete on server
              fetch('/api/agent/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  orderId: job.order_id,
                  success: true,
                }),
              }).then(() => {
                setStatus('SUCCESS');
                setPrintedCount((prev) => prev + 1);
                setPrintedHistory((prev) => [job, ...prev]);
                addLog(`Finished Printing #${job.order_number}! Marked PRINTED on Cloud DB.`);
                
                setTimeout(() => {
                  setStatus('IDLE');
                  setCurrentJob(null);
                  setProgress(0);
                }, 1500);
              });
            }
          }, 600);
        }
      } catch (err) {
        addLog(`Error checking spooler: ${err}`);
      }
    };

    checkJobs();
    const pollInterval = setInterval(checkJobs, 3000);
    return () => clearInterval(pollInterval);
  }, [isActive, status]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Top Header Card */}
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 backdrop-blur-xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-indigo-700 flex items-center justify-center text-white shadow-lg">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-white">Digital Printer Simulator</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 ${
                  isActive ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'}`} />
                  {isActive ? 'ONLINE & SPOOLING' : 'PAUSED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Virtual Printer connected to cloud database. Approving orders in Admin auto-prints here!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsActive(!isActive)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all active:scale-95 cursor-pointer ${
                isActive ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30' : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isActive ? 'Pause Spooler' : 'Start Spooler'}</span>
            </button>
            <Link
              href="/admin"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-2 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Go to Admin Portal</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Main Virtual Printer Output Display */}
          <div className="md:col-span-2 space-y-6">
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center min-h-[320px] relative overflow-hidden text-center">
              {/* Background Glow */}
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/10 via-transparent to-transparent pointer-events-none" />

              {status === 'PRINTING' && currentJob ? (
                <div className="space-y-6 max-w-md w-full relative z-10 animate-fade-in">
                  <div className="w-20 h-20 mx-auto rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 animate-bounce">
                    <Printer className="w-10 h-10" />
                  </div>

                  <div>
                    <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      PRINTING IN PROGRESS...
                    </span>
                    <h2 className="text-2xl font-black text-white mt-3">#{currentJob.order_number}</h2>
                    <p className="text-sm font-semibold text-slate-300 mt-1 truncate">{currentJob.file_name}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {currentJob.paper_size} • {currentJob.color_mode} • {currentJob.print_sides} • {currentJob.copies} Copy ({currentJob.page_count} Pages)
                    </p>
                  </div>

                  {/* Animated Progress Bar */}
                  <div className="space-y-2">
                    <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 via-indigo-400 to-emerald-400 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-400">
                      <span>Spooling pages...</span>
                      <span>{progress}%</span>
                    </div>
                  </div>
                </div>
              ) : status === 'SUCCESS' ? (
                <div className="space-y-4 relative z-10 animate-fade-in">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-emerald-300">Print Job Completed!</h3>
                  <p className="text-xs text-slate-400">Database updated to PRINTED.</p>
                </div>
              ) : (
                <div className="space-y-4 text-slate-500 relative z-10">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-slate-400">
                    <Printer className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-300">Virtual Printer Ready</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                      Go to the Admin Portal, approve an order, and watch it automatically print here digitally!
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Printed Output History */}
            <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Printed Trays / Output History</span>
                  <span className="px-2 py-0.5 text-xs font-extrabold bg-indigo-500/20 text-indigo-300 rounded-lg">
                    {printedCount} Jobs
                  </span>
                </h3>
              </div>

              {printedHistory.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">No simulated prints yet in this session.</div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 scrollbar-thin">
                  {printedHistory.map((j, idx) => (
                    <div
                      key={`${j.job_id}-${idx}`}
                      className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                        <div>
                          <div className="font-bold text-white">#{j.order_number} — {j.file_name}</div>
                          <div className="text-[10px] text-slate-400">
                            {j.paper_size} • {j.color_mode} • {j.copies} copy
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
                        PRINTED
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Realtime Terminal Console Log */}
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Printer Terminal Log</span>
              </h3>
              <button
                onClick={() => setLogs([])}
                className="text-[10px] text-slate-500 hover:text-slate-300 font-bold"
              >
                Clear
              </button>
            </div>

            <div className="flex-1 bg-slate-950 rounded-xl p-3 font-mono text-[11px] text-slate-400 overflow-y-auto max-h-[400px] space-y-1 scrollbar-thin border border-slate-800">
              {logs.length === 0 ? (
                <div className="text-slate-600 italic">Connecting to virtual spooler...</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="leading-snug break-all text-slate-300">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
