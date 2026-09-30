import React, { useState, useEffect } from 'react';
import { Wallet, QrCode, ArrowRight, ShieldCheck, CheckCircle2, Key } from 'lucide-react';

interface WalletColumnProps {
  issuedVc: any;
  onSelectForVerification: (vc: any) => void;
}

export const WalletColumn: React.FC<WalletColumnProps> = ({ issuedVc, onSelectForVerification }) => {
  const [walletType, setWalletType] = useState<'INJI_WEB' | 'INJI_MOBILE' | 'MOCK_EXTERNAL_WALLET'>('INJI_WEB');
  const [issuers, setIssuers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'VAULT' | 'CATALOG'>('VAULT');
  const [storedCredentials, setStoredCredentials] = useState<any[]>([]);

  useEffect(() => {
    fetch('http://localhost:4000/api/wallet/issuers')
      .then(res => res.json())
      .then(data => setIssuers(data?.response?.issuers || []))
      .catch(err => console.error(err));
  }, []);

  // When a new VC is issued, store it in the wallet vault
  useEffect(() => {
    if (issuedVc) {
      setStoredCredentials(prev => {
        const exists = prev.some(c => c.id === issuedVc.id);
        if (exists) return prev;
        return [issuedVc, ...prev];
      });
      setActiveTab('VAULT');
    }
  }, [issuedVc]);

  const activeVc = storedCredentials[0] || issuedVc;

  return (
    <div className="glass-panel p-5 flex flex-col gap-4 h-full border-t-4 border-t-indigo-500">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Wallet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-100">2. Holder / Wallet</h2>
            <span className="text-xs text-slate-400 font-mono">Vault & Presentation • Port 8099/3004</span>
          </div>
        </div>
        <span className="badge badge-pass">Role: Holder</span>
      </div>

      {/* Wallet Target Selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
          <span>Wallet Implementation:</span>
          <span className="text-[10px] text-indigo-400 font-mono">Cross-Platform</span>
        </label>
        <select
          value={walletType}
          onChange={(e) => setWalletType(e.target.value as any)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="INJI_WEB">Inji Web (Browser Vault - React/Mimoto)</option>
          <option value="INJI_MOBILE">Inji Wallet Mobile (Cross-Device QR / Deep-link)</option>
          <option value="MOCK_EXTERNAL_WALLET">External Standards-Compliant Wallet (Mock OID4VP)</option>
        </select>
      </div>

      {/* Profile info */}
      <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Vault Status:</span>
          <span className="font-mono text-emerald-400 flex items-center gap-1 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {storedCredentials.length} Credentials Held
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">Configured Issuers:</span>
          <span className="font-mono text-cyan-400">{issuers.length} Issuers (Farmer & MockMdl)</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab('VAULT')}
          className={`px-3 py-1.5 font-medium border-b-2 transition-colors ${
            activeTab === 'VAULT' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-slate-400'
          }`}
        >
          Credential Vault ({storedCredentials.length})
        </button>
        <button
          onClick={() => setActiveTab('CATALOG')}
          className={`px-3 py-1.5 font-medium border-b-2 transition-colors ${
            activeTab === 'CATALOG' ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-slate-400'
          }`}
        >
          Issuer Catalog ({issuers.length})
        </button>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'VAULT' && (
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
          {activeVc ? (
            <div className="bg-gradient-to-br from-slate-900 to-indigo-950/50 p-4 rounded-xl border border-indigo-500/30 flex flex-col gap-3 shadow-lg">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm">
                    {activeVc.type?.[1] || activeVc.type?.[0] || 'Verifiable Credential'}
                  </h3>
                  <span className="text-[10px] font-mono text-slate-400">{activeVc.id}</span>
                </div>
                <span className="badge badge-indigo text-[10px] uppercase font-mono">
                  {activeVc.format || 'ldp_vc'}
                </span>
              </div>

              {/* Subject Data Box */}
              <div className="bg-slate-950/80 rounded-lg p-3 text-[11px] font-mono space-y-1 text-slate-300 border border-slate-800">
                {Object.entries(activeVc.credentialSubject || {})
                  .filter(([k]) => !['_sd', '_sd_alg', 'id'].includes(k))
                  .slice(0, 4)
                  .map(([k, v]: any) => (
                    <div key={k} className="flex justify-between">
                      <span className="text-slate-500">{k}:</span>
                      <span className="text-slate-200 font-semibold">{String(v)}</span>
                    </div>
                  ))}
                {activeVc.disclosures && (
                  <div className="pt-1 mt-1 border-t border-slate-800 text-[10px] text-cyan-400 flex items-center gap-1">
                    <Key className="w-3 h-3" />
                    <span>{activeVc.disclosures.length} Selective Disclosures Protected</span>
                  </div>
                )}
              </div>

              {/* Proof info */}
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  {activeVc.proof?.type || 'Signed Proof'}
                </span>
                <span className="font-mono text-slate-500">
                  {activeVc.issuerImplementation || 'INJI_CERTIFY'}
                </span>
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={() => onSelectForVerification(activeVc)}
                className="w-full mt-1 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-md shadow-indigo-950/50 transition-all"
              >
                <span>Select for Presentation & Verification</span>
                <ArrowRight className="w-3.5 h-3.5 ml-auto" />
              </button>
            </div>
          ) : (
            <div className="p-8 border border-dashed border-slate-800 rounded-xl flex flex-col items-center justify-center text-center gap-2 text-slate-400">
              <Wallet className="w-8 h-8 text-slate-600 mb-1" />
              <p className="text-xs font-medium text-slate-300">Wallet Vault is currently empty</p>
              <p className="text-[11px] text-slate-500 max-w-[200px]">
                Issue a credential from Column 1 to populate this wallet vault.
              </p>
            </div>
          )}

          {/* Cross-Device Mobile Flow Preview */}
          {walletType === 'INJI_MOBILE' && (
            <div className="bg-slate-950/70 p-3 rounded-xl border border-indigo-500/20 flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg">
                <QrCode className="w-8 h-8 text-slate-950" />
              </div>
              <div className="flex flex-col text-[11px]">
                <span className="font-semibold text-slate-200">Cross-Device Presentation</span>
                <span className="text-slate-400 text-[10px]">Scan with Inji Mobile Wallet app</span>
                <span className="font-mono text-[9px] text-indigo-400 truncate max-w-[170px]">
                  openid4vp://authorize?client_id=verify
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Catalog Tab */}
      {activeTab === 'CATALOG' && (
        <div className="flex-1 overflow-y-auto space-y-2">
          {issuers.map((iss, i) => (
            <div key={i} className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 text-xs flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">{iss.display?.[0]?.name || iss.issuer_id}</span>
                <span className="badge badge-cyan text-[10px]">{iss.protocol}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono truncate">{iss.credential_issuer_host}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
