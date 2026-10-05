'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

interface SpidermanFeedbackModalProps {
  orderId?: string;
  orderNumber?: string;
  shopName?: string;
  isWaiting?: boolean; // True while payment pending, spooling, or printing
}

const PRESET_TAGS = [
  { id: 'fast', label: '⚡ Blazing Fast' },
  { id: 'quality', label: '🖨️ Crisp & Clear' },
  { id: 'pricing', label: '💰 Great Pricing' },
  { id: 'easy', label: '📲 Easy Mobile Upload' },
  { id: 'friendly', label: '🤝 Friendly Service' },
  { id: 'colors', label: '🎨 Vivid Colors' },
];

const RATING_QUIPS: Record<number, { text: string; emoji: string; color: string }> = {
  1: { text: 'Sticky situation! Needs rescue.', emoji: '🕸️', color: 'text-amber-400' },
  2: { text: 'Could be a bit stronger.', emoji: '🕷️', color: 'text-orange-400' },
  3: { text: 'Good neighborhood print!', emoji: '👍', color: 'text-yellow-400' },
  4: { text: 'Super heroic speed & service!', emoji: '🦸', color: 'text-blue-400' },
  5: { text: 'Spectacular & Spider-Tastic!', emoji: '🕷️✨', color: 'text-red-400' },
};

export const SpidermanFeedbackModal: React.FC<SpidermanFeedbackModalProps> = ({
  orderId,
  orderNumber,
  shopName = 'QuickPrint',
  isWaiting = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isZippingOut, setIsZippingOut] = useState(false);
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>(['⚡ Blazing Fast']);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hasDismissedAuto, setHasDismissedAuto] = useState(false);

  const storageKey = orderId ? `quickprint_feedback_submitted_${orderId}` : null;

  // Listen for global summon event from any button or component
  useEffect(() => {
    const handleTrigger = () => {
      setIsZippingOut(false);
      setIsOpen(true);
    };
    window.addEventListener('quickprint:open-spiderman-feedback', handleTrigger);
    return () => window.removeEventListener('quickprint:open-spiderman-feedback', handleTrigger);
  }, []);

  // Check if feedback was already completed
  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return;
    try {
      const alreadyDone = localStorage.getItem(storageKey);
      if (alreadyDone) {
        setSubmitted(true);
      }
    } catch {}
  }, [storageKey]);

  // Auto drop Spider-Man down after a brief wait when customer is waiting for printing
  useEffect(() => {
    if (!isWaiting || hasDismissedAuto || submitted) return;

    // Trigger Spider-Man descent after 3.2 seconds so user first sees order details
    const timer = setTimeout(() => {
      setIsOpen(true);
      setIsZippingOut(false);
    }, 3200);

    return () => clearTimeout(timer);
  }, [isWaiting, hasDismissedAuto, submitted]);

  const handleOpen = () => {
    setIsZippingOut(false);
    setIsOpen(true);
  };

  const handleClose = useCallback(() => {
    setIsZippingOut(true);
    setHasDismissedAuto(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsZippingOut(false);
    }, 650);
  }, []);

  const toggleTag = (label: string) => {
    setSelectedTags((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitted) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          orderNumber,
          shopName,
          rating,
          tags: selectedTags,
          comment,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to record feedback');
      }

      setSubmitted(true);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, 'true');
        } catch {}
      }

      // Auto zip Spider-Man back up after triumph message
      setTimeout(() => {
        handleClose();
      }, 2600);
    } catch (err) {
      console.error(err);
      // Soft-fallback so user experience remains delightful
      setSubmitted(true);
      setTimeout(() => {
        handleClose();
      }, 2600);
    } finally {
      setSubmitting(false);
    }
  };

  const activeRating = hoverRating || rating;
  const currentQuip = RATING_QUIPS[activeRating] || RATING_QUIPS[5];

  return (
    <>
      {/* Floating Spider-Man Action Pill (Always available to summon Spider-Man anytime) */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          type="button"
          onClick={handleOpen}
          className="group relative flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-red-600 via-red-500 to-blue-600 text-white font-black text-xs shadow-xl shadow-red-900/40 border border-white/20 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer select-none animate-web-pulse"
          aria-label="Open Spider-Man Feedback"
        >
          {/* Web Rope indicator swinging from button */}
          <span className="w-2 h-2 rounded-full bg-white animate-ping absolute -top-1 -right-1" />
          <span className="relative flex items-center justify-center w-6 h-6 rounded-full bg-white/20 text-sm">
            🕷️
          </span>
          <span className="tracking-wide">
            {submitted ? 'Spider-Feedback ⭐' : 'Rate Experience'}
          </span>
        </button>
      </div>

      {/* Spider-Man Hanging Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 overflow-y-auto overflow-x-hidden flex items-start justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-md transition-opacity duration-300"
        >
          {/* Backdrop dismiss */}
          <div
            className="fixed inset-0 -z-10 cursor-pointer"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Master Hanging Assembly: Rope + Spider-Man + Attached Web Feedback Card */}
          <div
            className={`relative w-full max-w-lg mx-auto flex flex-col items-center pt-0 pb-12 transition-all ${
              isZippingOut
                ? 'animate-spiderman-zip pointer-events-none'
                : 'animate-spiderman-drop'
            }`}
          >
            {/* 1. CONTINUOUS SILK WEB ROPE FROM CEILING (TOP OF SCREEN) */}
            <div className="relative w-full flex flex-col items-center pointer-events-none select-none">
              {/* Web Anchor at Ceiling */}
              <div className="w-12 h-2.5 bg-gradient-to-b from-white/90 to-transparent rounded-b-full shadow-lg shadow-white/40" />

              {/* The Web Rope */}
              <div className="relative w-1 h-20 sm:h-24 bg-gradient-to-b from-white via-slate-100 to-white/95 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.9)]">
                {/* Spiral Web Filaments */}
                <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:4px_6px] opacity-70" />
                {/* Dynamic Web Nodes */}
                <span className="absolute top-1/4 -left-1 w-3 h-1 bg-white/80 rounded-full blur-[0.5px]" />
                <span className="absolute top-2/3 -left-1 w-3 h-1 bg-white/80 rounded-full blur-[0.5px]" />
              </div>
            </div>

            {/* 2. SPIDER-MAN HANGING UPSIDE DOWN (Natural Pendulum Sway) */}
            <div className="relative flex flex-col items-center -mt-1 sm:-mt-2 pointer-events-auto">
              <div className="relative animate-spiderman-pendulum">
                {/* Comic "THWIP!" Web Sound Burst Accent */}
                <div className="absolute -top-3 -right-12 sm:-right-16 z-20 animate-comic-pop pointer-events-none select-none">
                  <div className="relative px-3 py-1 rounded-xl bg-gradient-to-br from-yellow-300 via-amber-400 to-red-500 text-slate-950 font-black text-[11px] sm:text-xs tracking-wider uppercase border-2 border-white shadow-xl rotate-12 transform">
                    THWIP! 🕸️
                  </div>
                </div>

                {/* Comic Speech Bubble */}
                <div className="absolute -left-36 sm:-left-44 top-10 z-20 w-36 sm:w-44 p-2.5 rounded-2xl bg-white text-slate-900 border-2 border-slate-900 shadow-xl text-center select-none animate-comic-pop">
                  <p className="text-[10px] sm:text-xs font-black leading-tight text-red-600 uppercase tracking-tight">
                    Friendly Neighborhood Hero!
                  </p>
                  <p className="text-[10px] sm:text-[11px] font-bold text-slate-700 leading-snug mt-0.5">
                    {submitted
                      ? "You're spectacular! Thanks True Believer! 🕸️"
                      : "While waiting for your prints, how's our service?"}
                  </p>
                  {/* Bubble Pointer towards Spidey */}
                  <div className="absolute top-5 -right-2 w-3 h-3 bg-white border-t-2 border-r-2 border-slate-900 rotate-45 transform" />
                </div>

                {/* Upside-down Spider-Man Image */}
                <div className="relative w-40 sm:w-48 h-48 sm:h-56 filter drop-shadow-[0_12px_24px_rgba(220,38,38,0.35)] select-none">
                  <Image
                    src="/spiderman.png"
                    alt="Spider-Man hanging on web rope"
                    fill
                    priority
                    sizes="(max-width: 640px) 160px, 192px"
                    className="object-contain"
                  />
                </div>
              </div>

              {/* Silk Strands Connecting Spider-Man's hands to the Feedback Card */}
              <div className="relative w-40 h-8 -mt-2 flex justify-between px-8 pointer-events-none select-none">
                <div className="w-0.5 h-full bg-gradient-to-b from-white to-white/70 shadow-[0_0_4px_white] -rotate-12 transform origin-top" />
                <div className="w-0.5 h-full bg-gradient-to-b from-white to-white/70 shadow-[0_0_4px_white] rotate-12 transform origin-top" />
              </div>
            </div>

            {/* 3. MARVEL-THEMED INTERACTIVE FEEDBACK CARD */}
            <div className="relative w-full rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900/98 to-slate-950 border-2 border-red-500/40 p-5 sm:p-7 text-white shadow-2xl shadow-red-950/60 overflow-hidden backdrop-blur-xl">
              {/* Subtle Spider-Web Radial Background */}
              <div className="absolute -top-24 -right-24 w-60 h-60 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

              {/* Close / Zip away button */}
              <button
                type="button"
                onClick={handleClose}
                className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer select-none active:scale-90"
                aria-label="Close feedback"
              >
                ✕
              </button>

              {/* Header Section */}
              <div className="text-center space-y-1.5 pb-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-red-600/30 to-blue-600/30 border border-red-500/40 text-[10px] sm:text-xs font-black uppercase tracking-wider text-red-300">
                  <span>🕷️ QuickPrint Live Feedback</span>
                  {orderNumber && (
                    <span className="font-mono text-amber-300">#{orderNumber}</span>
                  )}
                </div>

                <h3 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
                  <span>Rate Your Print Experience</span>
                </h3>

                <p className="text-xs text-slate-400 font-medium max-w-sm mx-auto">
                  Help Peter & {shopName} keep the printing station fast, sharp, and spectacular!
                </p>
              </div>

              {submitted ? (
                /* Celebration Triumph Screen */
                <div className="py-6 text-center space-y-4 animate-comic-pop">
                  <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-xl shadow-emerald-500/30 text-3xl animate-bounce">
                    ✨
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-xl font-black text-white">
                      THWIP! Feedback Delivered!
                    </h4>
                    <p className="text-xs text-slate-300 font-medium max-w-xs mx-auto">
                      With great prints comes great responsibility! Thank you for rating {shopName}.
                    </p>
                  </div>

                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 max-w-xs mx-auto text-xs text-amber-300 font-mono">
                    Rating: {rating} ★ · {selectedTags.join(', ') || 'Speedy Service'}
                  </div>

                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-6 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-all cursor-pointer"
                  >
                    Zip Spider-Man Back Up 🕸️
                  </button>
                </div>
              ) : (
                /* Interactive Feedback Form */
                <form onSubmit={handleSubmit} className="space-y-5 pt-2">
                  {/* 1. Big Interactive Stars */}
                  <div className="space-y-2 text-center">
                    <div className="flex items-center justify-center gap-2 sm:gap-3">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(null)}
                          className="group relative p-1 transition-transform duration-150 active:scale-125 hover:scale-110 cursor-pointer"
                          aria-label={`Rate ${star} star`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            className={`w-9 h-9 sm:w-10 sm:h-10 transition-colors duration-150 ${
                              star <= activeRating
                                ? 'fill-amber-400 text-amber-400 filter drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]'
                                : 'fill-slate-800 text-slate-700'
                            }`}
                          >
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        </button>
                      ))}
                    </div>

                    {/* Reactive Comic Reaction Text */}
                    <div className="h-6 flex items-center justify-center gap-1.5 text-xs sm:text-sm font-black transition-all">
                      <span>{currentQuip.emoji}</span>
                      <span className={currentQuip.color}>{currentQuip.text}</span>
                    </div>
                  </div>

                  {/* 2. Quick Tags Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      What made your print great?
                    </label>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {PRESET_TAGS.map((tag) => {
                        const isSelected = selectedTags.includes(tag.label);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => toggleTag(tag.label)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 cursor-pointer select-none active:scale-95 ${
                              isSelected
                                ? 'bg-red-600 text-white shadow-md shadow-red-600/30 border border-red-400'
                                : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 border border-slate-700/60'
                            }`}
                          >
                            {tag.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Optional Message / Suggestions */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <label
                        htmlFor="spidey-feedback-comment"
                        className="font-bold text-slate-400 uppercase tracking-wider"
                      >
                        Notes for the Shopkeeper
                      </label>
                      <span className="text-slate-500 font-mono text-[10px]">
                        Optional ({comment.length}/300)
                      </span>
                    </div>
                    <textarea
                      id="spidey-feedback-comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value.slice(0, 300))}
                      placeholder="Loved the print speed, perfect page formatting, or any suggestion..."
                      rows={2}
                      className="w-full rounded-2xl bg-slate-950/80 border border-slate-800 p-3 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all resize-none"
                    />
                  </div>

                  {/* 4. Action Buttons */}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer select-none"
                    >
                      Zip Away ✕
                    </button>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-[2] py-3 rounded-2xl bg-gradient-to-r from-red-600 via-red-500 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-xs sm:text-sm shadow-lg shadow-red-600/40 border border-red-400/40 transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50 select-none"
                    >
                      {submitting ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Shooting Web...</span>
                        </>
                      ) : (
                        <>
                          <span>THWIP! Send Feedback</span>
                          <span>🕸️</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Spider-Man Footnote */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 select-none">
                <span className="flex items-center gap-1 text-red-400 font-semibold">
                  <span>🕷️</span>
                  <span>Your Friendly Neighborhood Print Shop</span>
                </span>
                <span>QuickPrint 3.0</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export function triggerSpidermanFeedback() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('quickprint:open-spiderman-feedback'));
  }
}
