import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

type HealthEntry = { status: 'UP' | 'DOWN' | 'UNKNOWN'; url: string };
type Health = { certify: HealthEntry; mimoto: HealthEntry; verify: HealthEntry; database: HealthEntry };

interface OverviewPageProps {
  onStart: () => void;
}

const services: Array<{ key: keyof Health; name: string; role: string }> = [
  { key: 'certify', name: 'Inji Certify', role: 'Credential issuer' },
  { key: 'mimoto', name: 'Mimoto', role: 'Inji Web wallet' },
  { key: 'verify', name: 'Inji Verify', role: 'Presentation verifier' },
  { key: 'database', name: 'PostgreSQL', role: 'Stack database' },
];

const steps = [
  { title: 'Issue', text: 'Create a credential through Inji Certify or a clearly labeled local reference issuer.' },
  { title: 'Hold', text: 'Keep it in Inji Mobile, Inji Web, or the browser reference wallet.' },
  { title: 'Present', text: 'Approve an OpenID4VP request and share the requested credential.' },
  { title: 'Verify', text: 'Use the verifier response to determine whether the presentation passes.' },
];

export const OverviewPage: React.FC<OverviewPageProps> = ({ onStart }) => {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const reducedMotion = useReducedMotion();
  const healthStatuses = health ? Object.values(health).map(service => service.status) : [];
  const overallHealth = healthError ? 'down' : healthStatuses.length === 0
    ? 'unknown'
    : healthStatuses.some(status => status === 'DOWN')
      ? 'down'
      : healthStatuses.every(status => status === 'UP') ? 'up' : 'unknown';

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Health check failed (${response.status})`);
        return response.json() as Promise<Health>;
      })
      .then(data => setHealth(data))
      .catch(error => {
        if (error.name !== 'AbortError') setHealthError(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="overview-page mx-auto w-full max-w-[1440px] px-5 pb-6 pt-8 sm:px-8 lg:px-12 lg:pt-12">
      <motion.section
        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.45 }}
        className="overview-hero relative overflow-hidden rounded-[2rem] border border-[#F2680C]/25 bg-white/85 p-6 shadow-xl shadow-purple-950/5 dark:bg-[#10071f]/90 sm:p-10 lg:p-14"
      >
        <div className="relative z-10 grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="mb-5 text-[11px] font-extrabold uppercase tracking-[.18em] text-orange-700 dark:text-orange-300">MOSIP · INJI · INTEROPERABILITY LAB</p>
            <h2 className="max-w-2xl text-3xl font-black leading-[1.06] tracking-tight text-slate-950 dark:text-white sm:text-4xl lg:text-5xl">
              Follow a credential from <span className="overview-gradient-text">issue to verification.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">
              Exercise the issuer, wallet, and verifier together. Inspect the real protocol traffic, try supported credential formats, and see the verifier’s result for each run.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={onStart} className="overview-primary-button">Open the test workspace <span aria-hidden="true">→</span></button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl">
            <div className="overview-flow-card rounded-3xl border border-purple-200/80 bg-white/90 p-5 shadow-2xl shadow-purple-950/10 dark:border-purple-800/70 dark:bg-[#170c29]/95 sm:p-7">
              <div className="mb-5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-500 dark:text-slate-400">One complete exchange</p>
                  <span className="w-fit whitespace-nowrap rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Open standards</span>
                </div>
                <p className="mt-2 text-base font-extrabold leading-snug text-slate-900 dark:text-white sm:text-lg">Issuer <span aria-hidden="true">→</span> Wallet <span aria-hidden="true">→</span> Verifier</p>
              </div>
              <div className={`overview-flow-track ${reducedMotion ? 'is-static' : ''}`}>
                <motion.div className="overview-flow-progress" initial={reducedMotion ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: .25, duration: .9, ease: [.22, 1, .36, 1] }} />
                {!reducedMotion && <motion.span
                  className="overview-flow-particle"
                  aria-hidden="true"
                  animate={{ left: ['16.5%', '16.5%', '50%', '50%', '83.5%', '83.5%'], opacity: [0, 1, 1, 1, 1, 0] }}
                  transition={{ duration: 6.8, repeat: Infinity, ease: 'linear', times: [0, .08, .36, .44, .72, .82], repeatDelay: .5 }}
                />}
                {[
                  ['01', 'Issuer', 'OpenID4VCI'],
                  ['02', 'Wallet', 'Inji Mobile / Web'],
                  ['03', 'Verifier', 'OpenID4VP'],
                ].map(([number, title, detail], index) => <motion.div key={number} className="overview-node" initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reducedMotion ? 0 : .15 + index * .14, duration: .3 }}>
                  <span className="overview-node-number">{number}</span><span>{title}</span><small>{detail}</small>
                </motion.div>)}
              </div>
              <div className="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-[#0d0618]">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">A phone success screen confirms sharing.</p>
                <p className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-slate-400">The run passes only after Inji Verify returns an accepted result.</p>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
        <div className="overview-panel rounded-3xl border border-slate-200 bg-white/75 p-5 dark:border-purple-900/70 dark:bg-[#10071f]/80 sm:p-7">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.18em] text-orange-600 dark:text-orange-300">How to use the lab</p>
              <h3 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">Four steps, one traceable flow</h3>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {steps.map((step, index) => {
              return <article key={step.title} className={`overview-step-card overview-step-${index + 1}`}>
                <span className="overview-step-number"><span>0{index + 1}</span><span className="overview-step-kicker">STEP</span></span>
                <h4 className="mt-4 text-base font-extrabold text-slate-900 dark:text-white">{step.title}</h4>
                <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-400">{step.text}</p>
              </article>;
            })}
          </div>
          <p className="mt-5 rounded-2xl border border-purple-200 bg-purple-50/80 p-4 text-xs leading-5 text-slate-700 dark:border-purple-900/70 dark:bg-purple-950/20 dark:text-slate-300"><strong className="text-slate-900 dark:text-white">Inji Mobile path:</strong> create offer QR → phone <b>+ → Scan &amp; Download</b> → verifier QR → bottom bar <b>Share → Scan</b>.</p>
        </div>

        <aside className="overview-panel overview-health-panel rounded-3xl border border-slate-200 bg-slate-50/80 p-5 dark:border-purple-900/70 dark:bg-[#0d0618]/75 sm:p-7" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-orange-600 dark:text-orange-300">Live environment</p><h3 className="mt-1 text-xl font-black text-slate-900 dark:text-white">Stack health</h3></div>
            <span className={`overview-stack-indicator is-${overallHealth}`} aria-hidden="true" />
          </div>
          <div className="mt-5 space-y-3">
            {services.map(service => {
              const status = health?.[service.key]?.status;
              return <div key={service.key} className="flex items-center justify-between gap-3 border-b border-slate-200/80 pb-3 last:border-0 dark:border-purple-900/60">
                <div><p className="text-sm font-bold text-slate-900 dark:text-slate-100">{service.name}</p><p className="text-[11px] text-slate-500 dark:text-slate-400">{service.role}</p></div>
                <span className={`overview-health-pill ${status === 'UP' ? 'is-up' : status === 'DOWN' ? 'is-down' : 'is-unknown'}`}><span />{status || (healthError ? 'UNAVAILABLE' : 'CHECKING')}</span>
              </div>;
            })}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">Status comes from the playground backend health check. A down service can block its corresponding real integration path.</p>
        </aside>
      </section>
      <footer className="overview-footer mt-10 flex flex-col gap-2 border-t border-slate-200/80 pt-5 text-xs text-slate-500 dark:border-purple-900/50 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>Built by Arpit Tripathi</span>
        <a href="https://github.com/nexpectArpit/Decode_Mosip" target="_blank" rel="noreferrer" aria-label="GitHub repository" title="GitHub repository">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.76-.24.76-.54v-1.9c-3.1.67-3.76-1.32-3.76-1.32-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.71 2.61 1.22 3.25.93.1-.73.4-1.22.71-1.5-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.22 1.16-3-.12-.28-.5-1.42.11-2.96 0 0 .95-.3 3.08 1.15a10.7 10.7 0 0 1 5.6 0c2.13-1.45 3.08-1.15 3.08-1.15.61 1.54.23 2.68.11 2.96.72.78 1.16 1.78 1.16 3 0 4.29-2.62 5.23-5.12 5.51.4.35.76 1.03.76 2.08v3.09c0 .3.2.65.77.54A11.2 11.2 0 0 0 12 .8Z" /></svg>
        </a>
      </footer>
    </main>
  );
};
