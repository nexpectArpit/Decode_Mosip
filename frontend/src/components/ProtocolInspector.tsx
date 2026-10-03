import React, { useState, useEffect } from 'react';
import { Terminal, Trash2, Copy, Check } from 'lucide-react';
import { CustomSelect, type SelectOption } from './CustomSelect';

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

interface ProtocolInspectorProps {
  onSelectLogForTrace?: (log: ProtocolLog) => void;
  refreshTrigger?: number;
}

export const ProtocolInspector: React.FC<ProtocolInspectorProps> = ({ refreshTrigger }) => {
  const [logs, setLogs] = useState<ProtocolLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<ProtocolLog | null>(null);
  const [protocolFilter, setProtocolFilter] = useState<string>('ALL');
  const [copied, setCopied] = useState(false);

  const fetchLogs = async () => {
    try {
      const url = protocolFilter === 'ALL'
        ? 'http://localhost:4000/api/inspector/logs'
        : `http://localhost:4000/api/inspector/logs?protocol=${protocolFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      const fetchedLogs = data.logs || [];
      setLogs(fetchedLogs);
      
      if (fetchedLogs.length > 0) {
        setSelectedLog(prev => prev ? (fetchedLogs.find((l: ProtocolLog) => l.id === prev.id) || fetchedLogs[0]) : fetchedLogs[0]);
      } else {
        setSelectedLog(null);
      }
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
  }, [protocolFilter, refreshTrigger]);

  const handleCopyPayload = () => {
    if (selectedLog) {
      navigator.clipboard.writeText(JSON.stringify(selectedLog.payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const filterOptions: SelectOption[] = [
    { value: 'ALL', label: 'All Protocols' },
    { value: 'OpenID4VCI', label: 'OpenID4VCI' },
    { value: 'OpenID4VP', label: 'OpenID4VP' },
    { value: 'W3C_VC', label: 'W3C VC' }
  ];

  return (
    <div className="inji-card overflow-hidden flex flex-col transition-all duration-300 border-slate-200 dark:border-[#951F6F]/40 flex-1 bg-white dark:bg-[#140A24] shadow-sm dark:shadow-2xl">
      {/* Header Bar */}
      <div className="p-4 bg-slate-100 dark:bg-[#0B041A] border-b border-slate-200 dark:border-[#951F6F]/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-slate-900 dark:text-white font-extrabold text-xs uppercase tracking-wider italic">
            <Terminal className="w-4 h-4 text-[#F2680C]" />
            <span>Protocol Inspector & Network Debugger</span>
          </div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider bg-slate-200 dark:bg-[#F2680C]/20 text-slate-800 dark:text-[#F2680C] border border-slate-300 dark:border-[#F2680C]/40 px-2.5 py-0.5 rounded-full font-mono">
            {logs.length} TRACES
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-40">
            <CustomSelect
              options={filterOptions}
              value={protocolFilter}
              onChange={(val) => setProtocolFilter(val)}
            />
          </div>

          <button
            onClick={clearLogs}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-bold text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 bg-white dark:bg-[#1E0A3C] hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl border border-slate-200 dark:border-[#951F6F]/30 transition-colors cursor-pointer"
            title="Clear Trace Logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Debugger Content Area */}
      <div className="bg-slate-50 dark:bg-[#0B041A] text-xs font-mono flex-1 flex flex-col min-h-[320px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-[#951F6F]/30 flex-1 min-h-[320px]">
          {/* Log Trace Table */}
          <div className="overflow-y-auto p-3 space-y-1.5 max-h-[340px] bg-slate-50 dark:bg-[#0B041A]">
                {logs.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 dark:text-slate-500 italic">
                    No protocol interactions recorded yet. Issue or verify a credential above.
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between text-[11px] ${
                        selectedLog?.id === log.id
                          ? 'bg-[#F2680C]/10 dark:bg-gradient-to-r dark:from-[#1E0A3C] dark:to-[#0F041F] border-[#F2680C] text-slate-900 dark:text-white shadow-sm'
                          : 'bg-white dark:bg-[#140A24] border-slate-200 dark:border-[#951F6F]/30 text-slate-800 dark:text-slate-300 hover:bg-slate-100/60 dark:hover:border-[#951F6F]/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        <span className={`text-[10px] font-sans ${selectedLog?.id === log.id ? 'text-slate-600 dark:text-slate-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#F2680C]/10 dark:bg-[#F2680C]/20 text-[#F2680C] border border-[#F2680C]/30 dark:border-[#F2680C]/40 font-bold text-[10px]">
                          {log.protocol}
                        </span>
                        <span className={`truncate font-semibold ${selectedLog?.id === log.id ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-900 dark:text-white'}`}>{log.step}</span>
                      </div>

                      <div className="flex items-center gap-2 text-[10px] shrink-0 font-mono">
                        <span className={`font-sans ${selectedLog?.id === log.id ? 'text-slate-700 dark:text-slate-300 font-bold' : 'text-slate-600 dark:text-slate-400'}`}>{log.actor}</span>
                        {log.status && (
                          <span
                            className={`px-2 py-0.5 rounded-md font-extrabold ${
                              log.status < 300
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-[#1F9F60]/20 dark:text-[#1F9F60] dark:border-[#1F9F60]/40'
                                : 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950 dark:text-red-400 dark:border-red-700/60'
                            }`}
                          >
                            {log.status}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Selected Trace Request / Response Inspector */}
              <div className="p-4 overflow-y-auto bg-white dark:bg-[#05010B] text-slate-800 dark:text-slate-200 flex flex-col gap-3 max-h-[340px] border-l border-slate-200 dark:border-none">
                {selectedLog ? (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#951F6F]/30 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#F2680C] text-xs px-2.5 py-0.5 rounded bg-slate-100 dark:bg-[#140A24] border border-slate-300 dark:border-[#951F6F]/40">
                          {selectedLog.method}
                        </span>
                        <span className="text-slate-800 dark:text-slate-200 text-[11px] font-mono truncate">{selectedLog.endpoint}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedLog.durationMs !== undefined && (
                          <span className="text-[10px] text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-[#140A24] px-2 py-0.5 rounded border border-slate-300 dark:border-[#951F6F]/30 font-mono">
                            {selectedLog.durationMs}ms
                          </span>
                        )}
                        <button
                          onClick={handleCopyPayload}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-[#25123E] rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1 text-[10px] cursor-pointer"
                          title="Copy JSON Payload"
                        >
                          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-[#1F9F60]" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">HTTP Headers:</span>
                      <pre className="p-2.5 text-[10px] text-slate-800 dark:text-slate-300 bg-slate-50 dark:bg-[#0B041A] border border-slate-200 dark:border-[#951F6F]/30 rounded-lg overflow-x-auto font-mono">
                        {JSON.stringify(selectedLog.headers, null, 2)}
                      </pre>
                    </div>

                    <div className="flex flex-col gap-1 flex-1">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Payload Body:</span>
                      <pre className="p-2.5 text-[10px] text-emerald-800 dark:text-[#1F9F60] bg-slate-50 dark:bg-[#0B041A] border border-slate-200 dark:border-[#951F6F]/30 rounded-lg flex-1 overflow-auto font-mono leading-relaxed font-semibold">
                        {JSON.stringify(selectedLog.payload, null, 2)}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500 italic text-xs p-8 text-center">
                    Select a protocol trace on the left to inspect raw HTTP headers and payload bodies.
                  </div>
                )}
              </div>
            </div>
        </div>
    </div>
  );
};
