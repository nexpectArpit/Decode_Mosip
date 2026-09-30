import React, { useState, useEffect } from 'react';
import { Terminal, Trash2, ChevronDown, ChevronUp, Network, RefreshCw } from 'lucide-react';

interface ProtocolLog {
  id: string;
  timestamp: string;
  protocol: string;
  step: string;
  actor: string;
  direction: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  payload: any;
  status?: number;
  durationMs?: number;
}

export const ProtocolInspector: React.FC = () => {
  const [logs, setLogs] = useState<ProtocolLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<ProtocolLog | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [activeView, setActiveView] = useState<'LOGS' | 'SEQUENCE'>('LOGS');
  const [protocolFilter, setProtocolFilter] = useState<string>('ALL');

  const fetchLogs = async () => {
    try {
      const url = protocolFilter === 'ALL'
        ? 'http://localhost:4000/api/inspector/logs'
        : `http://localhost:4000/api/inspector/logs?protocol=${protocolFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error(err);
    }
  };

  const clearLogs = async () => {
    try {
      await fetch('http://localhost:4000/api/inspector/logs', { method: 'DELETE' });
      setLogs([]);
      setSelectedLog(null);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2500);
    return () => clearInterval(interval);
  }, [protocolFilter]);

  return (
    <div className="glass-panel border-t-2 border-t-cyan-500 overflow-hidden flex flex-col transition-all duration-300">
      {/* Header Bar */}
      <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
            <Terminal className="w-4 h-4" /> Protocol Inspector (Live Traces)
          </div>
          <span className="badge badge-cyan text-[10px]">{logs.length} Total Captured</span>

          {/* View Toggle */}
          <div className="flex bg-slate-900 rounded-md p-0.5 border border-slate-800 text-[11px]">
            <button
              onClick={() => setActiveView('LOGS')}
              className={`px-2.5 py-1 rounded transition-colors ${
                activeView === 'LOGS' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400'
              }`}
            >
              Live Payloads
            </button>
            <button
              onClick={() => setActiveView('SEQUENCE')}
              className={`px-2.5 py-1 rounded flex items-center gap-1 transition-colors ${
                activeView === 'SEQUENCE' ? 'bg-indigo-500/20 text-indigo-300 font-semibold' : 'text-slate-400'
              }`}
            >
              <Network className="w-3 h-3" />
              Protocol Sequence
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeView === 'LOGS' && (
            <select
              value={protocolFilter}
              onChange={(e) => setProtocolFilter(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-300 focus:outline-none"
            >
              <option value="ALL">All Protocols</option>
              <option value="OpenID4VCI">OpenID4VCI</option>
              <option value="OpenID4VP">OpenID4VP</option>
              <option value="W3C_VC">W3C_VC</option>
            </select>
          )}

          <button
            onClick={fetchLogs}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={clearLogs}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-red-400 transition-colors"
            title="Clear Logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Body Content */}
      {expanded && (
        <div className="h-72 flex flex-col overflow-hidden">
          {activeView === 'LOGS' ? (
            <div className="flex-1 flex overflow-hidden">
              {/* Log List */}
              <div className="w-1/2 border-r border-slate-800 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No protocol interactions recorded yet. Trigger an issuance or verification to view live traces.
                  </div>
                ) : (
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800">
                      <tr>
                        <th className="p-2">Time</th>
                        <th className="p-2">Protocol</th>
                        <th className="p-2">Step</th>
                        <th className="p-2">Actor</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {logs.map((log) => (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedLog(log)}
                          className={`cursor-pointer transition-colors ${
                            selectedLog?.id === log.id ? 'bg-cyan-950/40 text-cyan-200' : 'hover:bg-slate-900/60 text-slate-300'
                          }`}
                        >
                          <td className="p-2 text-slate-500 whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="p-2">
                            <span className="badge badge-indigo text-[9px]">{log.protocol}</span>
                          </td>
                          <td className="p-2 truncate max-w-[140px] font-sans font-medium">{log.step}</td>
                          <td className="p-2">
                            <span className="text-[10px] text-slate-400">{log.actor}</span>
                          </td>
                          <td className="p-2">
                            {log.direction === 'RESPONSE' ? (
                              <span
                                className={`text-[10px] px-1 rounded font-bold ${
                                  log.status && log.status < 400
                                    ? 'bg-emerald-500/10 text-emerald-400'
                                    : 'bg-red-500/10 text-red-400'
                                }`}
                              >
                                {log.status || 200}
                              </span>
                            ) : (
                              <span className="text-[10px] text-cyan-400 font-bold">{log.method}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Payload Detail */}
              <div className="w-1/2 p-3 overflow-y-auto bg-slate-950/50 flex flex-col gap-2 font-mono text-xs">
                {selectedLog ? (
                  <>
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div>
                        <span className="font-bold text-slate-200 block font-sans">{selectedLog.step}</span>
                        <span className="text-[10px] text-slate-400">{selectedLog.endpoint}</span>
                      </div>
                      {selectedLog.durationMs && (
                        <span className="badge badge-cyan text-[10px]">{selectedLog.durationMs}ms</span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block mb-1">Payload:</span>
                      <pre className="bg-slate-950 p-2.5 rounded border border-slate-800/80 text-[10px] text-cyan-300 overflow-x-auto max-h-48">
                        {JSON.stringify(selectedLog.payload, null, 2)}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500 font-sans">
                    Click any protocol step on the left to inspect raw headers and exchanged payload.
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Sequence Diagram View */
            <div className="flex-1 p-4 bg-slate-950/60 overflow-y-auto font-mono text-xs flex flex-col items-center justify-center gap-3">
              <div className="w-full max-w-2xl bg-slate-900/90 border border-slate-800 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-slate-800 text-[11px] font-sans">
                  <span className="font-bold text-slate-200">Interactive OpenID4VCI & OpenID4VP Protocol Sequence</span>
                  <span className="badge badge-pass text-[9px]">Live Handshake Flow</span>
                </div>

                <div className="flex justify-between text-center font-bold text-xs text-slate-300 py-1">
                  <div className="w-1/4 p-1.5 bg-cyan-950/40 border border-cyan-800/40 rounded text-cyan-300">
                    ISSUER (Inji Certify)
                  </div>
                  <div className="w-1/4 p-1.5 bg-indigo-950/40 border border-indigo-800/40 rounded text-indigo-300">
                    WALLET (Inji Web)
                  </div>
                  <div className="w-1/4 p-1.5 bg-emerald-950/40 border border-emerald-800/40 rounded text-emerald-300">
                    VERIFIER (Inji Verify)
                  </div>
                </div>

                <div className="space-y-2 text-[10px] text-slate-300">
                  <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                    <span className="text-cyan-400">1. Credential Offer (openid-credential-offer://)</span>
                    <span className="text-slate-500">Issuer ➔ Wallet</span>
                  </div>
                  <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                    <span className="text-indigo-400">2. OAuth2 Pre-Auth Code Exchange & Token Issuance</span>
                    <span className="text-slate-500">Wallet ➔ Issuer</span>
                  </div>
                  <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                    <span className="text-cyan-400">3. Issue Signed VC (W3C JSON-LD / SD-JWT / mDoc)</span>
                    <span className="text-slate-500">Issuer ➔ Wallet Vault</span>
                  </div>
                  <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                    <span className="text-emerald-400">4. OpenID4VP Authorization Request (openid4vp://)</span>
                    <span className="text-slate-500">Verifier ➔ Wallet</span>
                  </div>
                  <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                    <span className="text-indigo-400">5. Present Verifiable Presentation (VP Token + Proof)</span>
                    <span className="text-slate-500">Wallet ➔ Verifier</span>
                  </div>
                  <div className="p-2 bg-slate-950 rounded border border-slate-800 flex items-center justify-between">
                    <span className="text-emerald-400">6. Cryptographic Signature & Temporal Check Result</span>
                    <span className="text-slate-500">Verifier Engine</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
