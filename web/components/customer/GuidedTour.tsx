'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TourStep, TOUR_STEPS } from '@/lib/tour';
import { X, Sparkles } from '@/components/ui/Icons';

interface GuidedTourProps {
  isOpen: boolean;
  onClose: () => void;
  steps?: TourStep[];
  isManual?: boolean;
}

interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const GuidedTour: React.FC<GuidedTourProps> = ({
  isOpen,
  onClose,
  steps = TOUR_STEPS,
  isManual = false,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({
    top: 0,
    left: 0,
    placement: 'bottom',
  });
  const [isReady, setIsReady] = useState(false);

  const tooltipRef = useRef<HTMLDivElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  const currentStep = steps[currentStepIndex];

  // Capture active element to restore focus when tour closes
  useEffect(() => {
    if (isOpen) {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      setCurrentStepIndex(0);
    } else {
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
      setSpotlightRect(null);
      setIsReady(false);
    }
  }, [isOpen]);

  // Scroll target into view ONLY on step change or tour open (never continuously on scroll)
  useEffect(() => {
    if (!isOpen || !currentStep) return;

    const targetEl = document.querySelector(currentStep.targetSelector) as HTMLElement | null;
    if (!targetEl) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const rect = targetEl.getBoundingClientRect();
    const isVisible = rect.top >= 40 && rect.bottom <= window.innerHeight - 40;

    if (!isVisible) {
      targetEl.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }
  }, [isOpen, currentStepIndex, currentStep]);

  // Measure and position the spotlight and tooltip for the active step
  const updatePosition = useCallback(() => {
    if (!isOpen || !currentStep) return;

    const targetEl = document.querySelector(currentStep.targetSelector) as HTMLElement | null;

    if (!targetEl) {
      // If current target is unavailable, safely try next step or finish
      if (currentStepIndex < steps.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
      } else {
        onClose();
      }
      return;
    }

    const freshRect = targetEl.getBoundingClientRect();
    const padding = 8;
    const x = Math.max(4, freshRect.left - padding);
    const y = Math.max(4, freshRect.top - padding);
    const width = Math.min(window.innerWidth - 8, freshRect.width + padding * 2);
    const height = freshRect.height + padding * 2;

    setSpotlightRect({ x, y, width, height });

    // Compute tooltip position
    const tooltipWidth = Math.min(window.innerWidth - 32, 380);
    const tooltipHeight = tooltipRef.current?.offsetHeight || 220;

    const targetCenter = x + width / 2;
    let left = targetCenter - tooltipWidth / 2;
    // Clamp inside viewport
    left = Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, left));

    const spaceBelow = window.innerHeight - (y + height);
    const spaceAbove = y;

    let top: number;
    let placement: 'top' | 'bottom';

    if (spaceBelow >= tooltipHeight + 20) {
      top = y + height + 12;
      placement = 'bottom';
    } else if (spaceAbove >= tooltipHeight + 20) {
      top = y - tooltipHeight - 12;
      placement = 'top';
    } else if (spaceBelow >= spaceAbove) {
      top = Math.max(16, y + height + 12);
      placement = 'bottom';
    } else {
      top = Math.max(16, y - tooltipHeight - 12);
      placement = 'top';
    }

    // Safety clamp top
    top = Math.max(12, Math.min(window.innerHeight - tooltipHeight - 12, top));

    setTooltipPos({ top, left, placement });
    setIsReady(true);
  }, [isOpen, currentStep, currentStepIndex, steps.length, onClose]);

  // Update position on mount, step change, resize, and scroll
  useEffect(() => {
    if (!isOpen) return;

    // Small delay to allow scrollIntoView to settle
    const timer = setTimeout(() => {
      updatePosition();
    }, 80);

    const handleScrollOrResize = () => {
      requestAnimationFrame(updatePosition);
    };

    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize);
    };
  }, [isOpen, currentStepIndex, updatePosition]);

  // Focus the primary action button on step change
  useEffect(() => {
    if (isOpen && isReady && primaryButtonRef.current) {
      primaryButtonRef.current.focus();
    }
  }, [isOpen, isReady, currentStepIndex]);

  // Keyboard navigation & Focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentStepIndex < steps.length - 1) {
          setCurrentStepIndex((prev) => prev + 1);
        } else {
          onClose();
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentStepIndex > 0) {
          setCurrentStepIndex((prev) => prev - 1);
        }
        return;
      }

      // Focus trap within tooltip
      if (e.key === 'Tab' && tooltipRef.current) {
        const focusable = tooltipRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStepIndex, steps.length, onClose]);

  if (!isOpen || !currentStep) return null;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onClose();
    } else {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-dialog-title"
      aria-describedby="tour-dialog-desc"
    >
      {/* SVG Spotlight Mask Overlay */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-auto"
        style={{ width: '100vw', height: '100vh' }}
        aria-hidden="true"
        onClick={onClose}
      >
        <defs>
          <mask id="quickprint-tour-spotlight-mask">
            {/* White covers all (opaque mask) */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black hole cuts out the target spotlight */}
            {spotlightRect && (
              <rect
                x={spotlightRect.x}
                y={spotlightRect.y}
                width={spotlightRect.width}
                height={spotlightRect.height}
                rx={16}
                ry={16}
                fill="black"
              />
            )}
          </mask>
        </defs>
        {/* Dark backdrop with cutout */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.72)"
          mask="url(#quickprint-tour-spotlight-mask)"
        />
      </svg>

      {/* Target Focus Ring & Pulse */}
      {spotlightRect && (
        <div
          className="fixed pointer-events-none z-50 rounded-2xl ring-2 ring-indigo-400 ring-offset-2 ring-offset-transparent shadow-[0_0_24px_rgba(99,102,241,0.4)] transition-all duration-300"
          style={{
            top: `${spotlightRect.y}px`,
            left: `${spotlightRect.x}px`,
            width: `${spotlightRect.width}px`,
            height: `${spotlightRect.height}px`,
          }}
          aria-hidden="true"
        />
      )}

      {/* Interactive Tooltip Card */}
      <div
        ref={tooltipRef}
        role="document"
        className="fixed z-50 bg-white/98 backdrop-blur-xl border border-slate-200/95 rounded-2xl shadow-2xl p-4 sm:p-5 transition-all duration-200 animate-fadeIn"
        style={{
          top: `${tooltipPos.top}px`,
          left: `${tooltipPos.left}px`,
          width: `min(calc(100vw - 32px), 380px)`,
          maxWidth: '380px',
          opacity: isReady ? 1 : 0,
        }}
      >
        {/* Card Header: Step Pill, Progress Dots, Close Button */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold tracking-tight">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              <span>Step {currentStepIndex + 1} of {steps.length}</span>
            </span>
            {isManual && (
              <span className="text-[10px] text-slate-600 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                Guide
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Step progress dots */}
            <div className="flex items-center gap-1 mr-1" aria-hidden="true">
              {steps.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentStepIndex
                      ? 'w-4 bg-indigo-600'
                      : idx < currentStepIndex
                      ? 'w-1.5 bg-indigo-300'
                      : 'w-1.5 bg-slate-200'
                  }`}
                />
              ))}
            </div>

            {/* Close cross button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close tour"
              title="Close tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Title */}
        <h3
          id="tour-dialog-title"
          className="text-sm sm:text-base font-bold text-slate-900 leading-snug mb-1"
        >
          {currentStep.title}
        </h3>

        {/* Instruction */}
        <p
          id="tour-dialog-desc"
          className="text-xs sm:text-sm text-slate-700 leading-relaxed font-medium"
        >
          {currentStep.instruction}
        </p>

        {/* Secondary detail hint */}
        {currentStep.detail && (
          <p className="text-[11px] sm:text-xs text-slate-600 mt-1 leading-normal">
            {currentStep.detail}
          </p>
        )}

        {/* Bottom Actions Row */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          {/* Skip link button */}
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Skip
          </button>

          <div className="flex items-center gap-2">
            {/* Back button */}
            {!isFirstStep && (
              <button
                type="button"
                onClick={handleBack}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition-colors cursor-pointer active-press"
              >
                Back
              </button>
            )}

            {/* Next / Finish primary button */}
            <button
              ref={primaryButtonRef}
              type="button"
              onClick={handleNext}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all cursor-pointer active-press"
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
GuidedTour.displayName = 'GuidedTour';
