import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface TraceStep {
  id: string;
  actor: 'ISSUER' | 'WALLET' | 'VERIFIER' | 'BFF';
  direction: 'REQUEST' | 'RESPONSE' | 'INTERNAL';
  step: string;
  protocol: string;
  status?: number;
}

const safeLabel = (value: string) => value.replace(/[^\p{L}\p{N} ._()[\]-]/gu, ' ').slice(0, 52);

function toMermaid(steps: TraceStep[], darkMode: boolean): string {
  const lines = [
    'sequenceDiagram',
    'participant Issuer',
    'participant Playground',
    'participant Wallet',
    'participant Verifier'
  ];

  if (steps.length === 0) {
    lines.push('Issuer-->>Playground: Issue a credential to begin');
    lines.push('Playground-->>Wallet: Hold in playground vault');
    lines.push('Wallet-->>Verifier: Select and verify');
    return lines.join('\n');
  }

  steps.forEach((step, index) => {
    const local = step.direction === 'INTERNAL';
    let from: string;
    let to: string;
    if (local) {
      from = step.actor === 'BFF' ? 'Playground' : step.actor[0] + step.actor.slice(1).toLowerCase();
      to = from;
    } else if (step.protocol === 'OpenID4VCI') {
      from = step.direction === 'REQUEST' ? 'Wallet' : 'Issuer';
      to = step.direction === 'REQUEST' ? 'Issuer' : 'Wallet';
    } else if (step.protocol === 'OpenID4VP') {
      if (step.step.includes('Generate OpenID4VP Authorization Request') || step.step.includes('Authorization request created')) {
        from = 'Verifier'; to = 'Wallet';
      } else if (step.direction === 'REQUEST' && step.actor === 'WALLET') {
        from = 'Wallet'; to = 'Verifier';
      } else if (step.direction === 'REQUEST') {
        from = 'Wallet'; to = 'Verifier';
      } else {
        from = 'Verifier'; to = 'Wallet';
      }
    } else {
      from = step.direction === 'REQUEST' ? 'Playground' : 'Verifier';
      to = step.direction === 'REQUEST' ? 'Verifier' : 'Playground';
    }
    const label = safeLabel(`${step.protocol} ${step.step}${step.status ? ` HTTP ${step.status}` : ''}`);
    if (index === steps.length - 1) {
      lines.push(darkMode ? 'rect rgb(116, 52, 12)' : 'rect rgb(255, 235, 214)');
    }
    lines.push(`${from}${step.direction === 'RESPONSE' ? '-->>' : '->>'}${to}: ${label}`);
    if (index === steps.length - 1) lines.push('end');
  });
  return lines.join('\n');
}

export const SequenceDiagram: React.FC<{ refreshTrigger: number; flowId?: string }> = ({ refreshTrigger, flowId }) => {
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [svg, setSvg] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const diagramId = useRef(`inji-sequence-${crypto.randomUUID()}`);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setDarkMode(root.classList.contains('dark')));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const query = flowId ? `?flowId=${encodeURIComponent(flowId)}` : '';
        const response = await fetch(`/api/inspector/logs${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Trace request failed (${response.status})`);
        const data = await response.json();
        const next: TraceStep[] = (data.logs || []).slice(0, 40).reverse();
        setSteps(previous => previous.length === next.length && previous.every((step, index) => step.id === next[index].id) ? previous : next);
        setError('');
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load traces');
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 1200);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [expanded, refreshTrigger, flowId]);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    const render = async () => {
      try {
        const textColor = darkMode ? '#F8FAFC' : '#1E293B';
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: {
            background: darkMode ? '#100620' : '#FFFFFF',
            primaryColor: darkMode ? '#25123E' : '#F8FAFC',
            primaryBorderColor: darkMode ? '#C3379B' : '#CBD5E1',
            primaryTextColor: textColor,
            secondaryColor: darkMode ? '#1E0A3C' : '#F1F5F9',
            tertiaryColor: darkMode ? '#38124D' : '#FFF7ED',
            lineColor: darkMode ? '#D8C7E8' : '#64748B',
            textColor,
            mainBkg: darkMode ? '#100620' : '#FFFFFF',
            actorBkg: darkMode ? '#25123E' : '#F8FAFC',
            actorBorder: darkMode ? '#C3379B' : '#64748B',
            actorTextColor: textColor,
            actorLineColor: darkMode ? '#A78BB9' : '#94A3B8',
            signalColor: darkMode ? '#E9D5FF' : '#334155',
            signalTextColor: textColor,
            labelBoxBkgColor: darkMode ? '#25123E' : '#F8FAFC',
            labelBoxBorderColor: darkMode ? '#C3379B' : '#64748B',
            labelTextColor: textColor,
            loopTextColor: textColor,
            noteBkgColor: darkMode ? '#38124D' : '#FFF7ED',
            noteBorderColor: darkMode ? '#F2680C' : '#FB923C',
            noteTextColor: textColor,
            activationBkgColor: darkMode ? '#451B61' : '#E2E8F0',
            activationBorderColor: darkMode ? '#C3379B' : '#64748B',
            sequenceNumberColor: darkMode ? '#100620' : '#FFFFFF'
          }
        });
        const result = await mermaid.render(`${diagramId.current}-${Date.now()}`, toMermaid(steps, darkMode));
        if (!cancelled) setSvg(result.svg);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not render sequence');
      }
    };
    void render();
    return () => { cancelled = true; };
  }, [expanded, steps, darkMode]);

  return (
    <section className="inji-card min-w-0 mt-6 overflow-hidden border-slate-200 dark:border-[#951F6F]/40 bg-white dark:bg-[#140A24]">
      <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}
        className="w-full p-4 bg-slate-100 dark:bg-[#0B041A] text-left flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
        <span>Live Sequence Diagram <span className="ml-2 text-[#F2680C]">{steps.length} recent steps</span></span>
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="min-w-0 p-4" aria-live="polite">
          {error && <p role="alert" className="text-red-700 text-xs">{error}</p>}
          <p className="mb-3 hidden text-xs text-slate-600 dark:text-slate-300 sm:block">Orange highlights the latest step. Scroll sideways to read the full diagram.</p>
          <p className="mb-3 text-xs text-slate-600 dark:text-slate-300 sm:hidden">Follow the flow and recent protocol steps below.</p>
          {svg && <div className="hidden w-full max-w-full overflow-x-auto rounded-xl bg-white p-3 dark:bg-[#100620] sm:block">
            <div className="sequence-diagram-canvas" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>}
          {steps.length === 0 && <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 rounded-xl bg-slate-50 p-3 text-center text-[10px] font-bold text-slate-800 dark:bg-[#100620] dark:text-slate-100 sm:hidden">
            <span className="rounded-lg border border-orange-200 bg-white px-1 py-2 dark:border-orange-900 dark:bg-[#1E0A3C]">Issuer</span>
            <span aria-hidden="true" className="text-[#F2680C]">→</span>
            <span className="rounded-lg border border-orange-200 bg-white px-1 py-2 dark:border-orange-900 dark:bg-[#1E0A3C]">Wallet</span>
            <span aria-hidden="true" className="text-[#F2680C]">→</span>
            <span className="rounded-lg border border-orange-200 bg-white px-1 py-2 dark:border-orange-900 dark:bg-[#1E0A3C]">Verifier</span>
          </div>}
          {steps.length > 0 && <ol aria-label="Recent protocol steps" className="mt-3 space-y-1 text-left text-xs text-slate-700 dark:text-slate-200">
            {steps.slice(-5).map(step => <li key={step.id} className="break-words rounded-lg bg-slate-50 px-3 py-2 dark:bg-[#100620]">
              <span className="font-bold text-[#F2680C]">{step.actor}</span> · {step.step}{step.status ? ` · HTTP ${step.status}` : ''}
            </li>)}
          </ol>}
        </div>
      )}
    </section>
  );
};
