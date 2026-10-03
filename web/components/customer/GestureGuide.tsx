'use client';

import { useCallback, useEffect, useState } from 'react';

interface GuidePosition {
  highlight: DOMRect;
  finger: { left: number; top: number; pointsUp: boolean };
}

interface GestureGuideProps {
  target: string | null;
}

function findVisibleTarget(target: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-guide-target="${target}"]`)).find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  }) ?? null;
}

export function GestureGuide({ target }: GestureGuideProps) {
  const [position, setPosition] = useState<GuidePosition | null>(null);

  const updatePosition = useCallback(() => {
    if (!target) {
      setPosition(null);
      return;
    }

    const element = findVisibleTarget(target);
    if (!element) {
      setPosition(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    const visible = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
    if (!visible) {
      setPosition(null);
      return;
    }

    const pointsUp = rect.bottom + 44 < window.innerHeight;
    setPosition({
      highlight: rect,
      finger: {
        left: Math.max(4, Math.min(window.innerWidth - 36, rect.left + rect.width / 2 - 18)),
        top: pointsUp ? Math.min(window.innerHeight - 44, rect.bottom + 2) : Math.max(4, rect.top - 42),
        pointsUp,
      },
    });
  }, [target]);

  useEffect(() => {
    updatePosition();
    if (!target) return;

    let frame = 0;
    const requestUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updatePosition);
    };

    const observer = new ResizeObserver(requestUpdate);
    const targetElement = findVisibleTarget(target);
    if (targetElement) observer.observe(targetElement);

    window.addEventListener('scroll', requestUpdate, { passive: true, capture: true });
    window.addEventListener('resize', requestUpdate, { passive: true });
    window.visualViewport?.addEventListener('resize', requestUpdate, { passive: true });
    window.visualViewport?.addEventListener('scroll', requestUpdate, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('scroll', requestUpdate, true);
      window.removeEventListener('resize', requestUpdate);
      window.visualViewport?.removeEventListener('resize', requestUpdate);
      window.visualViewport?.removeEventListener('scroll', requestUpdate);
    };
  }, [target, updatePosition]);

  if (!position) return null;

  const { highlight, finger } = position;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-hidden="true">
      <div
        className="fixed rounded-2xl border border-indigo-400/50 shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
        style={{ left: highlight.left - 3, top: highlight.top - 3, width: highlight.width + 6, height: highlight.height + 6 }}
      />
      <div
        className={`fixed h-9 w-9 ${finger.pointsUp ? '' : 'rotate-180'}`}
        style={{ left: finger.left, top: finger.top }}
      >
        <div className="gesture-guide-tap h-9 w-9">
          <svg className="h-9 w-9 text-indigo-600 drop-shadow-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v10" />
            <path d="M9.5 7.5 12 5l2.5 2.5" />
            <path d="M8.5 21v-5.5a1.5 1.5 0 0 1 3 0V17" />
            <path d="M11.5 17v-3a1.5 1.5 0 0 1 3 0v3" />
            <path d="M14.5 17v-2a1.5 1.5 0 0 1 3 0v3.5c0 1.4-1.1 2.5-2.5 2.5H12c-1.9 0-3.5-1.6-3.5-3.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
