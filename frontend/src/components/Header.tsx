import React, { useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, FileText } from 'lucide-react';

interface SystemHealth {
  certify: { status: string };
  mimoto: { status: string };
  verify: { status: string };
  database: { status: string };
}

interface HeaderProps {
  onOpenReport: () => void;
  onRefreshHealth: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenReport, onRefreshHealth }) => {
  const [health, setHealth] = useState<SystemHealth>({
    certify: { status: 'UNKNOWN' },
    mimoto: { status: 'UNKNOWN' },
    verify: { status: 'UNKNOWN' },
    database: { status: 'UNKNOWN' }
  });
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/health');
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({
        certify: { status: 'DOWN' },
        mimoto: { status: 'DOWN' },
        verify: { status: 'DOWN' },
        database: { status: 'DOWN' }
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const getStatusDot = (status: string) => {
    if (status === 'UP') return 'bg-emerald-400 shadow-[0_0_8px_#34d399]';
    if (status === 'WARN') return 'bg-amber-400 shadow-[0_0_8px_#fbbf24]';
    return 'bg-rose-500 shadow-[0_0_8px_#f43f5e]';
  };

  return (
    <header className="glass-panel sticky top-0 z-40 mb-6 p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white shadow-lg shadow-indigo-500/30">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            MOSIP Inji Interoperability Playground
          </h1>
          <p className="text-xs text-slate-400">
            OpenID4VCI & OpenID4VP Standard Protocol Testing Suite
          </p>
        </div>
      </div>

      {/* System Status Indicators */}
      <div className="flex items-center gap-4 bg-slate-950/60 px-4 py-2 rounded-xl border border-slate-800/80">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium">Inji Stack:</span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5" title="Inji Certify (Port 8090)">
            <span className={`w-2 h-2 rounded-full ${getStatusDot(health.certify.status)}`} />
            <span className="text-slate-300">Certify:8090</span>
          </div>

          <div className="flex items-center gap-1.5" title="Mimoto BFF (Port 8099)">
            <span className={`w-2 h-2 rounded-full ${getStatusDot(health.mimoto.status)}`} />
            <span className="text-slate-300">Mimoto:8099</span>
          </div>

          <div className="flex items-center gap-1.5" title="Inji Verify (Port 8095)">
            <span className={`w-2 h-2 rounded-full ${getStatusDot(health.verify.status)}`} />
            <span className="text-slate-300">Verify:8095</span>
          </div>

          <div className="flex items-center gap-1.5" title="Playground BFF (Port 4000)">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <span className="text-slate-300">BFF:4000</span>
          </div>
        </div>

        <button
          onClick={() => { fetchHealth(); onRefreshHealth(); }}
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          title="Refresh Stack Status"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenReport}
          className="btn btn-primary text-xs"
        >
          <FileText className="w-4 h-4" />
          Interop Report
        </button>
      </div>
    </header>
  );
};
