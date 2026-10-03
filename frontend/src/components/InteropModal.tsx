import React, { useState } from 'react';
import { X, CheckCircle, Play } from 'lucide-react';

interface InteropModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InteropModal: React.FC<InteropModalProps> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<any>(null);
  const [matrixData, setMatrixData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'STANDARDS' | 'MATRIX'>('STANDARDS');
  const [isRunningMatrix, setIsRunningMatrix] = useState(false);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  const fetchReport = async () => {
    setIsLoadingReport(true);
    try {
      const res = await fetch('http://localhost:4000/api/interop/report');
      const data = await res.json();
      setReport(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingReport(false);
    }
  };

  const handleRunMatrix = async () => {
    setIsRunningMatrix(true);
    try {
      const res = await fetch('http://localhost:4000/api/interop/matrix/run', {
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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      {/* Signature Inji Gradient Audit Modal Container */}
      <div className="inji-card w-full max-w-4xl p-7 space-y-6 rounded-[2.5rem] shadow-2xl max-h-[90vh] flex flex-col text-slate-900 dark:text-white transition-colors overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#d2c3f5]/70 dark:border-[#951F6F]/30 pb-4">
          <div>
            <h2 className="text-xl font-extrabold text-[#002452] dark:text-[#F2680C] italic tracking-tight">
              Interoperability & Conformance Audit
            </h2>
            <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              Standards Verification Engine across Issuer, Wallet, and Verifier nodes
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-xl hover:bg-slate-200/60 dark:hover:bg-[#25123E] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Metric Bar with Inji Sub-Cards */}
        <div className="grid grid-cols-4 gap-3.5">
          <div className="inji-subcard p-4 rounded-2xl flex flex-col">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono font-bold">Compliance Score</span>
            <span className="text-2xl font-black text-[#F2680C] mt-0.5">
              {matrixData?.matrixSuccessRate !== undefined ? `${matrixData.matrixSuccessRate}%` : (isRunningMatrix ? '...' : '—')}
            </span>
          </div>
          <div className="inji-subcard p-4 rounded-2xl flex flex-col">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono font-bold">Standards Checks</span>
            <span className="text-2xl font-black text-[#1F9F60] mt-0.5">
              {totalReqs !== undefined ? `${passedReqs} / ${totalReqs} PASS` : '—'}
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
        <div className="flex items-center justify-between border-b border-[#d2c3f5]/70 dark:border-[#951F6F]/30 pb-2 text-xs font-mono">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('STANDARDS')}
              className={`px-4 py-2 font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'STANDARDS' ? 'bg-gradient-to-r from-[#F2680C] to-[#451691] dark:to-[#951F6F] text-white shadow-md' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-[#25123E]'
              }`}
            >
              Normative Specifications
            </button>
            <button
              onClick={() => setActiveTab('MATRIX')}
              className={`px-4 py-2 font-bold rounded-xl transition-all cursor-pointer ${
                activeTab === 'MATRIX' ? 'bg-[#451691] dark:bg-[#5B03AD] text-white shadow-md' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-[#25123E]'
              }`}
            >
              Live Interop Matrix (10 Scenarios)
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'STANDARDS' && (
              <button
                onClick={fetchReport}
                disabled={isLoadingReport}
                className="flex items-center gap-1.5 bg-[#1F9F60] hover:bg-[#18804c] text-white text-xs px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer font-bold border border-white/20"
              >
                <Play className={`w-3.5 h-3.5 ${isLoadingReport ? 'animate-spin' : ''}`} />
                <span>{isLoadingReport ? 'Auditing Standards...' : (report ? 'Re-run Standards Audit' : 'Run Standards Audit')}</span>
              </button>
            )}

            {activeTab === 'MATRIX' && (
              <button
                onClick={handleRunMatrix}
                disabled={isRunningMatrix}
                className="flex items-center gap-1.5 bg-[#1F9F60] hover:bg-[#18804c] text-white text-xs px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer font-bold border border-white/20"
              >
                <Play className={`w-3.5 h-3.5 ${isRunningMatrix ? 'animate-spin' : ''}`} />
                <span>{isRunningMatrix ? 'Running Matrix (10 Scenarios)...' : (matrixData ? 'Re-run Matrix Test' : 'Run Interop Matrix')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto max-h-[350px]">
          {activeTab === 'STANDARDS' ? (
            <div className="space-y-3">
              {isLoadingReport ? (
                <div className="p-12 text-center text-xs font-mono text-slate-500 animate-pulse">
                  Auditing normative standards conformance specifications against backend services...
                </div>
              ) : !report?.requirements ? (
                <div className="p-12 text-center text-xs font-mono text-slate-500 flex flex-col items-center justify-center">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">No standards conformance audit has been executed yet.</span>
                  <span className="text-[11px] text-slate-400 mt-1">Click &quot;Run Standards Audit&quot; above to verify normative specifications.</span>
                </div>
              ) : (
                <div className="space-y-5">
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
                            {summary.passedRequirements} / {summary.totalRequirements} Passed
                          </span>
                        </div>

                        <div className="space-y-2">
                          {reqs.map((check: any, idx: number) => (
                            <div key={check.id || idx} className="inji-subcard p-3.5 rounded-2xl flex items-start gap-3">
                              <CheckCircle className="w-4 h-4 text-[#1F9F60] shrink-0 mt-0.5" />
                              <div className="flex-1 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="font-extrabold text-[#002452] dark:text-[#F2680C] text-xs font-mono">{check.title || check.name}</span>
                                  <span className="bg-[#1F9F60]/10 dark:bg-[#1F9F60]/20 text-[#1F9F60] border border-[#1F9F60]/30 dark:border-[#1F9F60]/40 px-2 py-0.5 rounded-full text-[9px] font-mono font-extrabold">
                                    {check.passed ? 'PASS' : 'FAIL'}
                                  </span>
                                </div>
                                <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed text-[11px] font-medium">{check.description}</p>
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
          ) : (
            <div className="inji-subcard overflow-x-auto rounded-2xl">
              {isRunningMatrix ? (
                <div className="p-12 text-center text-xs font-mono text-slate-500 animate-pulse">
                  Executing live cryptographic matrix assertions across Issuer, Wallet, and Verifier...
                </div>
              ) : !matrixData ? (
                <div className="p-12 text-center text-xs font-mono text-slate-500 flex flex-col items-center justify-center">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">No matrix scenarios have been executed yet.</span>
                  <span className="text-[11px] text-slate-400 mt-1">Click &quot;Run Interop Matrix&quot; above to execute the 10 cryptographic tests.</span>
                </div>
              ) : (
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-[#EBE6FC]/70 dark:bg-[#0B041A] text-[#002452] dark:text-slate-300 border-b border-[#d2c3f5]/70 dark:border-[#951F6F]/40 font-bold">
                      <th className="p-3">#</th>
                      <th className="p-3">Issuer</th>
                      <th className="p-3">Wallet</th>
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
          )}
        </div>
      </div>
    </div>
  );
};
