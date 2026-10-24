import React, { useState } from 'react';
import { X, CheckCircle, Play } from 'lucide-react';

interface InteropModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InteropModal: React.FC<InteropModalProps> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<any>(null);
  const [matrixData, setMatrixData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'STANDARDS' | 'MATRIX' | 'WALLET_VP'>('STANDARDS');
  const [isRunningMatrix, setIsRunningMatrix] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [auditHistory, setAuditHistory] = useState<any[]>([]);
  const [vpHistory, setVpHistory] = useState<any[]>([]);
  const [vpHistoryError, setVpHistoryError] = useState<string | null>(null);

  const loadVPHistory = async () => {
    setVpHistoryError(null);
    try {
      const response = await fetch('/api/verifier/vp-history?limit=50');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `VP history failed (${response.status})`);
      setVpHistory(data.runs || []);
    } catch (error: any) {
      setVpHistoryError(error.message || 'Could not load VP history');
    }
  };

  const fetchReport = async () => {
    setIsLoadingReport(true);
    setReportError(null);
    try {
      const res = await fetch('/api/interop/report');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Audit failed (${res.status})`);
      setReport(data);
      const historyRes = await fetch('/api/interop/report/history?limit=10');
      if (historyRes.ok) setAuditHistory((await historyRes.json()).runs || []);
    } catch (err: any) {
      setReportError(err.message);
    } finally {
      setIsLoadingReport(false);
    }
  };

  const handleRunMatrix = async () => {
    setIsRunningMatrix(true);
    try {
      const res = await fetch('/api/interop/matrix/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setMatrixData(data);
    } catch (err) {
      console.error('Matrix run error:', err);
    } finally {
      setIsRunningMatrix(false);
    }
  };

  if (!isOpen) return null;

  const negativeTests = matrixData?.results?.filter((r: any) => r.tamperScenario !== 'NONE') || [];
  const negativePassed = negativeTests.filter((r: any) => r.passed).length;
  const negativeScore = negativeTests.length > 0 ? `${Math.round((negativePassed / negativeTests.length) * 100)}% REJECT` : '—';

  const totalReqs = report?.summaries?.reduce((acc: number, s: any) => acc + s.totalRequirements, 0);
  const passedReqs = report?.summaries?.reduce((acc: number, s: any) => acc + s.passedRequirements, 0);
  const upstreamNonceControl = report?.requirements?.find((item: any) => item.id === 'OID4VP-RESP-04')
    ?.evidence?.rawUpstreamNonceControl;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      {/* Signature Inji Gradient Audit Modal Container */}
      <div className="audit-modal-card inji-card w-full max-w-4xl p-4 sm:p-7 space-y-4 sm:space-y-6 rounded-2xl sm:rounded-[2.5rem] shadow-2xl max-h-[92vh] flex flex-col text-slate-900 dark:text-white transition-colors overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#d2c3f5]/70 dark:border-[#951F6F]/30 pb-4">
          <div>
            <h2 className="text-base sm:text-xl font-extrabold text-[#002452] dark:text-[#F2680C] italic tracking-tight">
              Interoperability & Conformance Audit
            </h2>
            <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              Requirements catalog and issuer/verifier API test results
            </span>
          </div>
          <button
            onClick={onClose}
            className="audit-modal-close p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-200/60 dark:hover:bg-[#25123E] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Metric Bar with Inji Sub-Cards */}
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3.5">
          <div className="inji-subcard p-4 rounded-2xl flex flex-col">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono font-bold">API Matrix Pass Rate</span>
            <span className="text-2xl font-black text-[#F2680C] mt-0.5">
              {matrixData?.matrixSuccessRate !== undefined ? `${matrixData.matrixSuccessRate}%` : (isRunningMatrix ? '...' : '—')}
            </span>
          </div>
          <div className="inji-subcard p-4 rounded-2xl flex flex-col">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono font-bold">Standards Checks</span>
            <span className="text-2xl font-black text-[#1F9F60] mt-0.5">
              {totalReqs !== undefined ? `${passedReqs} / ${totalReqs} CHECKS` : '—'}
            </span>
          </div>
          <div className="inji-subcard p-4 rounded-2xl flex flex-col">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono font-bold">Matrix Scenarios</span>
            <span className="text-2xl font-black text-[#451691] dark:text-[#a855f7] mt-0.5">
              {matrixData ? `${matrixData.passedTotal} / ${matrixData.totalTests} PASS` : (isRunningMatrix ? 'Running...' : '—')}
            </span>
          </div>
          <div className="inji-subcard p-4 rounded-2xl flex flex-col">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono font-bold">Negative-Path Security</span>
            <span className="text-2xl font-black text-[#1F9F60] mt-0.5">
              {negativeScore}
            </span>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#d2c3f5]/70 dark:border-[#951F6F]/30 pb-2 gap-3 text-xs font-mono">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('STANDARDS')}
              className={`px-4 py-2 font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'STANDARDS' ? 'bg-gradient-to-r from-[#F2680C] to-[#451691] dark:to-[#951F6F] text-white shadow-md' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-[#25123E]'
              }`}
            >
              Requirements Catalog
            </button>
            <button
              onClick={() => setActiveTab('MATRIX')}
              className={`px-4 py-2 font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'MATRIX' ? 'bg-[#451691] dark:bg-[#5B03AD] text-white shadow-md' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-[#25123E]'
              }`}
            >
              Interop Matrix (11 Scenarios)
            </button>
            <button
              onClick={() => { setActiveTab('WALLET_VP'); void loadVPHistory(); }}
              className={`px-4 py-2 font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'WALLET_VP' ? 'bg-[#451691] dark:bg-[#5B03AD] text-white shadow-md' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-[#25123E]'
              }`}
            >
              Wallet VP Runs
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab === 'STANDARDS' && (
              <><a
                href="/api/interop/report/export?format=md"
                className="flex items-center gap-1.5 bg-[#451691] text-white text-xs px-4 py-2 rounded-xl font-bold"
              >Export Audit</a><button
                onClick={fetchReport}
                disabled={isLoadingReport}
                className="flex items-center gap-1.5 bg-[#1F9F60] hover:bg-[#18804c] text-white text-xs px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer font-bold border border-white/20"
              >
                <Play className={`w-3.5 h-3.5 ${isLoadingReport ? 'animate-spin' : ''}`} />
                <span>{isLoadingReport ? 'Refreshing...' : 'Refresh Status'}</span>
              </button></>
            )}

            {activeTab === 'MATRIX' && (
              <><a
                href="/api/interop/matrix/export?format=md"
                className="flex items-center gap-1.5 bg-[#451691] text-white text-xs px-4 py-2 rounded-xl font-bold"
              >Export History</a><button
                onClick={handleRunMatrix}
                disabled={isRunningMatrix}
                className="flex items-center gap-1.5 bg-[#1F9F60] hover:bg-[#18804c] text-white text-xs px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer font-bold border border-white/20"
              >
                <Play className={`w-3.5 h-3.5 ${isRunningMatrix ? 'animate-spin' : ''}`} />
                <span>{isRunningMatrix ? 'Running Matrix (11 Scenarios)...' : (matrixData ? 'Re-run Matrix Test' : 'Run Interop Matrix')}</span>
              </button></>
            )}

            {activeTab === 'WALLET_VP' && <><a href="/api/verifier/vp-history/export?format=md"
              className="flex items-center gap-1.5 bg-[#451691] text-white text-xs px-4 py-2 rounded-xl font-bold">Export VP Runs</a>
              <button onClick={() => void loadVPHistory()} className="flex items-center gap-1.5 bg-[#1F9F60] text-white text-xs px-4 py-2 rounded-xl font-bold">Refresh</button></>}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto max-h-[350px]">
          {activeTab === 'STANDARDS' ? (
            <div className="space-y-3">
              {isLoadingReport ? (
                <div className="p-12 text-center text-xs font-mono text-slate-500 animate-pulse">
                  Loading requirements and probing upstream services...
                </div>
              ) : !report?.requirements ? (
                <div className="p-12 text-center text-xs font-mono text-slate-500 flex flex-col items-center justify-center">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">Requirements catalog has not been loaded.</span>
                  <span className="text-[11px] text-slate-400 mt-1">Run the audit to execute live API and local reference assertions.</span>
                  {reportError && <span className="text-[11px] text-red-600 mt-2">{reportError}</span>}
                </div>
              ) : (
                <div className="space-y-5">
                  {auditHistory.length > 0 && <details className="inji-subcard rounded-2xl px-4 py-3 text-[11px]">
                    <summary className="font-bold cursor-pointer">Past audits ({auditHistory.length} recent) · latest {auditHistory[0]?.overallScore}%</summary>
                    <div className="mt-2 space-y-1 font-mono">
                      {auditHistory.map(run => <div key={run.id} className="flex justify-between gap-3">
                        <span>{new Date(run.timestamp).toLocaleString()}</span>
                        <span>{run.passed}/{run.total} · {run.overallScore}%</span>
                      </div>)}
                    </div>
                  </details>}
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 px-1">
                    {report.coverage?.upstreamApi}/{report.coverage?.upstreamApiTotal} upstream API passed · {report.coverage?.localReference}/{report.coverage?.localReferenceTotal} local reference passed · {report.coverage?.walletPresentation}/{report.coverage?.walletPresentationTotal} wallet presentation passed. These probes are not a formal certification.
                  </p>
                  {upstreamNonceControl && (
                    <div role="status" className={`rounded-xl border px-4 py-3 text-[11px] ${
                      upstreamNonceControl.accepted
                        ? 'border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
                        : 'border-emerald-500/40 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100'
                    }`}>
                      {upstreamNonceControl.accepted
                        ? 'Upstream gap: the direct Inji Verify control accepted a mismatched holder-proof nonce. The playground gateway rejected the same attack before forwarding it. Route wallet presentations through the gateway; this 20/20 score measures the protected playground path, not upstream Verify in isolation.'
                        : 'Direct Inji Verify control rejected the mismatched holder-proof nonce; the playground gateway nonce guard was also exercised.'}
                    </div>
                  )}
                  {(report.summaries || []).map((summary: any) => {
                    const specKey = summary.spec || summary.specification;
                    const reqs = (report.requirements || []).filter((r: any) => r.specification === specKey);
                    return (
                      <div key={specKey} className="space-y-2.5">
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs text-[#002452] dark:text-white uppercase tracking-wider font-mono">
                              {summary.specName || summary.name}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">({summary.specVersion || summary.version})</span>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-[#1F9F60] bg-[#1F9F60]/10 dark:bg-[#1F9F60]/20 border border-[#1F9F60]/30 px-2 py-0.5 rounded-full">
                            {summary.passedRequirements} / {summary.totalRequirements} Verified
                          </span>
                        </div>

                        <div className="space-y-2">
                          {reqs.map((check: any, idx: number) => (
                            <div key={check.id || idx} className="inji-subcard p-3.5 rounded-2xl flex items-start gap-3">
                              <CheckCircle className={`w-4 h-4 shrink-0 mt-0.5 ${check.passed ? 'text-[#1F9F60]' : 'text-slate-400'}`} />
                              <div className="flex-1 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="font-extrabold text-[#002452] dark:text-[#F2680C] text-xs font-mono">{check.title || check.name}</span>
                                  <span className="bg-[#1F9F60]/10 dark:bg-[#1F9F60]/20 text-[#1F9F60] border border-[#1F9F60]/30 dark:border-[#1F9F60]/40 px-2 py-0.5 rounded-full text-[9px] font-mono font-extrabold">
                                    {check.tested ? (check.passed ? 'PASS' : 'FAIL') : 'UNTESTED'}
                                  </span>
                                </div>
                                <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed text-[11px] font-medium">{check.description}</p>
                                <p className="text-slate-500 dark:text-slate-400 mt-1 text-[10px] font-mono">
                                  {check.scope === 'UPSTREAM_API' ? 'Live upstream API' : check.scope === 'LOCAL_REFERENCE' ? 'Local reference crypto' : check.scope === 'WALLET_PRESENTATION' ? 'Wallet presentation' : 'Not run'}
                                  {check.failureReason ? ` · ${check.failureReason}` : ''}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'MATRIX' ? (
            <div className="inji-subcard overflow-x-auto rounded-2xl">
              {isRunningMatrix ? (
                <div className="p-12 text-center text-xs font-mono text-slate-500 animate-pulse">
                  Executing API and local reference wallet checks. Physical Inji Mobile transport is not exercised.
                </div>
              ) : !matrixData ? (
                <div className="p-12 text-center text-xs font-mono text-slate-500 flex flex-col items-center justify-center">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">No matrix scenarios have been executed yet.</span>
                  <span className="text-[11px] text-slate-400 mt-1">Click &quot;Run Interop Matrix&quot; above to execute the 11 scenarios.</span>
                </div>
              ) : (
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-[#EBE6FC]/70 dark:bg-[#0B041A] text-[#002452] dark:text-slate-300 border-b border-[#d2c3f5]/70 dark:border-[#951F6F]/40 font-bold">
                      <th className="p-3">#</th>
                      <th className="p-3">Issuer</th>
                      <th className="p-3">Wallet used</th>
                      <th className="p-3">Verifier</th>
                      <th className="p-3">Format</th>
                      <th className="p-3">Attack Vector</th>
                      <th className="p-3">Expect</th>
                      <th className="p-3">Latency</th>
                      <th className="p-3">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d2c3f5]/50 dark:divide-[#951F6F]/30 text-[11px] text-slate-800 dark:text-slate-200">
                    {(matrixData?.results || []).map((s: any, idx: number) => (
                      <tr key={s.id || idx} className="hover:bg-white/60 dark:hover:bg-[#1C0D33]">
                        <td className="p-3 font-bold">{idx + 1}</td>
                        <td className="p-3 font-bold text-[#F2680C]">{s.issuer}</td>
                        <td className="p-3 text-slate-600 dark:text-slate-300">{s.wallet}</td>
                        <td className="p-3 font-bold text-[#451691] dark:text-[#a855f7]">{s.verifier}</td>
                        <td className="p-3 text-slate-500 dark:text-slate-400 font-semibold">{s.format}</td>
                        <td className="p-3 text-red-600 dark:text-red-400 font-bold">{s.tamperScenario}</td>
                        <td className="p-3">{s.expectedOutcome}</td>
                        <td className="p-3 text-slate-500">{s.latencyMs}ms</td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                              s.passed
                                ? 'bg-[#1F9F60]/10 text-[#1F9F60] border-[#1F9F60]/30 dark:bg-[#1F9F60]/20 dark:border-[#1F9F60]/40'
                                : 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-700/60'
                            }`}
                          >
                            {s.passed ? 'PASS' : 'FAIL'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="inji-subcard overflow-x-auto rounded-2xl p-4 text-xs">
              <p className="mb-3 text-slate-600 dark:text-slate-300">These runs are recorded from Inji Verify transaction results. The selected wallet is a UI choice; the verifier result does not independently identify the wallet app. Submitted credential details are claims from the wallet payload; “Verified VCs” counts only verifier results.</p>
              {vpHistoryError && <p role="alert" className="text-red-700 dark:text-red-300">{vpHistoryError}</p>}
              {!vpHistoryError && vpHistory.length === 0 ? <p>No completed external wallet VP runs have been recorded yet.</p> :
                <table className="w-full min-w-[850px] text-left font-mono">
                  <thead><tr><th className="p-2">Completed</th><th className="p-2">Selected wallet</th><th className="p-2">Verifier result</th><th className="p-2">Submitted format / proof</th><th className="p-2">Verified VCs</th><th className="p-2">Transaction</th></tr></thead>
                  <tbody>{vpHistory.map(run => <tr key={run.transactionId} className="border-t border-slate-300/40 dark:border-slate-600/40">
                    <td className="p-2">{new Date(run.completedAt).toLocaleString()}</td>
                    <td className="p-2">{run.selectedWallet}</td>
                    <td className={`p-2 font-bold ${run.valid ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>{run.vpResultStatus}</td>
                    <td className="p-2">{[...(run.submittedCredentialFormats || []), ...(run.submittedCredentialProofTypes || [])].join(' / ') || 'Unknown'}</td>
                    <td className="p-2">{run.credentialCount}</td>
                    <td className="p-2 break-all">{run.transactionId}</td>
                  </tr>)}</tbody>
                </table>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
