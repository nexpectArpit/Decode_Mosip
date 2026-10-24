import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';

const tourSteps = [
  {
    target: 'issuer',
    title: 'Issue a credential',
    body: 'Choose Inji Certify and W3C VC. Create the offer, then on your phone use + → Scan & Download.',
  },
  {
    target: 'wallet',
    title: 'Choose the wallet',
    body: 'Select Inji Mobile to test with your phone. The playground cannot inspect the cards stored inside the app.',
  },
  {
    target: 'verifier',
    title: 'Present to Inji Verify',
    body: 'Open the official Verify request. On your phone use bottom-bar Share → Scan, choose the card, and approve sharing.',
  },
  {
    target: 'inspector',
    title: 'Inspect the exchange',
    body: 'Review captured requests and responses, including endpoints, status codes, timing, and available payload details.',
  },
  {
    target: 'sequence',
    title: 'Follow the protocol steps',
    body: 'The sequence diagram follows recorded traffic. “Shared successfully” confirms upload; the run passes only when Inji Verify accepts the credential.',
  },
];

interface WorkspaceTourProps {
  active: boolean;
  onFinish: () => void;
  onSkip: () => void;
}

interface TourLayout {
  target: DOMRect;
  left: number;
  top: number;
  width: number;
  popoverHeight: number;
  side: 'left' | 'right' | 'above' | 'below';
}

export const WorkspaceTour: React.FC<WorkspaceTourProps> = ({ active, onFinish, onSkip }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [layout, setLayout] = useState<TourLayout | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const step = tourSteps[stepIndex];

  const measure = useCallback(() => {
    if (!active || !step) return;
    const targetElement = document.querySelector<HTMLElement>(`[data-tour-target="${step.target}"]`);
    const popover = popoverRef.current;
    if (!targetElement || !popover) return;

    const rect = targetElement.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const width = Math.min(330, window.innerWidth - 32);
    const gap = 18;
    let side: TourLayout['side'] = 'below';
    let left = (window.innerWidth - width) / 2;
    let top: number;

    if (window.innerWidth >= 900) {
      const canRight = window.innerWidth - rect.right >= width + gap + 12;
      const canLeft = rect.left >= width + gap + 12;
      if (canRight) {
        side = 'right';
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - popoverRect.height / 2;
      } else if (canLeft) {
        side = 'left';
        left = rect.left - width - gap;
        top = rect.top + rect.height / 2 - popoverRect.height / 2;
      } else if (rect.bottom + popoverRect.height + gap < window.innerHeight) {
        side = 'below';
        top = rect.bottom + gap;
      } else {
        side = 'above';
        top = rect.top - popoverRect.height - gap;
      }
    } else {
      const belowTop = rect.bottom + 14;
      const aboveTop = rect.top - popoverRect.height - 14;
      if (belowTop + popoverRect.height <= window.innerHeight - 12) {
        side = 'below';
        top = belowTop;
      } else if (aboveTop >= 12) {
        side = 'above';
        top = aboveTop;
      } else {
        side = 'below';
        top = Math.max(12, Math.min(window.innerHeight - popoverRect.height - 12, rect.top + rect.height / 2));
      }
    }

    top = Math.max(12, Math.min(top, window.innerHeight - popoverRect.height - 12));
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    setLayout({ target: rect, left, top, width, popoverHeight: popoverRect.height, side });
  }, [active, step]);

  useEffect(() => {
    if (!active || !step) return;
    const target = document.querySelector<HTMLElement>(`[data-tour-target="${step.target}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
    let firstFrame = 0;
    let secondFrame = 0;
    const frame = () => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(measure);
      });
    };
    frame();
    const timeout = window.setTimeout(measure, reducedMotion ? 40 : 420);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(timeout);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      observer.disconnect();
    };
  }, [active, step, measure, reducedMotion]);

  useEffect(() => {
    if (!active) return;
    nextRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSkip();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, stepIndex, onSkip]);

  const finish = () => {
    setLayout(null);
    setStepIndex(0);
    onFinish();
  };
  const skip = () => {
    setLayout(null);
    setStepIndex(0);
    onSkip();
  };
  if (!active) return null;

  return (
    <div className="workspace-tour-layer" aria-live="polite">
      {layout && <>
        <div className="workspace-tour-shade" style={{ left: 0, top: 0, width: '100vw', height: layout.target.top }} />
        <div className="workspace-tour-shade" style={{ left: 0, top: layout.target.top, width: layout.target.left, height: layout.target.height }} />
        <div className="workspace-tour-shade" style={{ left: layout.target.right, top: layout.target.top, width: Math.max(0, window.innerWidth - layout.target.right), height: layout.target.height }} />
        <div className="workspace-tour-shade" style={{ left: 0, top: layout.target.bottom, width: '100vw', height: Math.max(0, window.innerHeight - layout.target.bottom) }} />
      </>}
      {layout && <div className="workspace-tour-spotlight" style={{ left: layout.target.left, top: layout.target.top, width: layout.target.width, height: layout.target.height }} />}
      <AnimatePresence mode="wait">
        <motion.section
          key={stepIndex}
          ref={popoverRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Tour step ${stepIndex + 1} of ${tourSteps.length}: ${step.title}`}
          className={`workspace-tour-popover ${layout ? `is-${layout.side}` : ''}`}
          style={layout ? { left: layout.left, top: layout.top, width: layout.width, visibility: 'visible' } : { left: 16, top: 16, width: 'min(330px, calc(100vw - 32px))', visibility: 'hidden' }}
          initial={reducedMotion ? false : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: -3 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          <div className="workspace-tour-topline"><span>STEP {String(stepIndex + 1).padStart(2, '0')} <span className="font-normal opacity-60">/ {String(tourSteps.length).padStart(2, '0')}</span></span></div>
          <div className="workspace-tour-progress" aria-hidden="true"><span style={{ width: `${((stepIndex + 1) / tourSteps.length) * 100}%` }} /></div>
          <div className="p-5 sm:p-6">
            <h2 className="text-lg font-black leading-tight text-slate-950 dark:text-white">{step.title}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{step.body}</p>
            <div className="mt-6 flex items-center justify-between gap-3">
              <button type="button" onClick={skip} className="text-xs font-bold text-slate-500 underline underline-offset-4 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Skip tour</button>
              <div className="flex items-center gap-2">
                {stepIndex > 0 && <button type="button" onClick={() => setStepIndex(index => Math.max(0, index - 1))} className="workspace-tour-back-button"><ArrowLeft className="h-4 w-4" /> Back</button>}
                {stepIndex === tourSteps.length - 1 ? <button ref={nextRef} type="button" onClick={finish} className="workspace-tour-next-button">Finish</button> : <button ref={nextRef} type="button" onClick={() => setStepIndex(index => Math.min(tourSteps.length - 1, index + 1))} className="workspace-tour-next-button">Next <ArrowRight className="h-4 w-4" /></button>}
              </div>
            </div>
          </div>
        </motion.section>
      </AnimatePresence>
    </div>
  );
};
