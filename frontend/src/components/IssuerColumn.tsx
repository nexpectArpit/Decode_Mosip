import React, { useState, useEffect } from 'react';
import { Building2, ArrowRight, Sparkles, Layers } from 'lucide-react';

interface IssuerColumnProps {
  onIssueSuccess: (vc: any) => void;
}

export const IssuerColumn: React.FC<IssuerColumnProps> = ({ onIssueSuccess }) => {
  const [implementation, setImplementation] = useState<'INJI_CERTIFY' | 'MOCK_EXTERNAL_OID4VCI'>('INJI_CERTIFY');
  const [format, setFormat] = useState<'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc'>('ldp_vc');
  const [uin, setUin] = useState('9876543210');
  const [fullName, setFullName] = useState('Ramesh Patel');
  const [isIssuing, setIsIssuing] = useState(false);
  const [wellKnown, setWellKnown] = useState<any>(null);
  const [didDoc, setDidDoc] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'DISCOVERY' | 'DID'>('DISCOVERY');

  const fetchMetadata = async () => {
    try {
      const res = await fetch(`http://localhost:4000/api/issuer/well-known?implementation=${implementation}`);
      const data = await res.json();
      setWellKnown(data);

      const resDid = await fetch(`http://localhost:4000/api/issuer/did?implementation=${implementation}`);
      const dataDid = await resDid.json();
      setDidDoc(dataDid);
    } catch (err) {
      console.error('Failed to load issuer info:', err);
    }
  };

  useEffect(() => {
    fetchMetadata();
  }, [implementation]);

  const handleIssue = async () => {
    setIsIssuing(true);
    try {
      let credentialType = 'FarmerCredential';
      if (format === 'vc+sd-jwt') credentialType = 'NationalId';
      if (format === 'mso_mdoc') credentialType = 'MockMdl';

      const res = await fetch('http://localhost:4000/api/issuer/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          implementation,
          format,
          credentialType,
          uin,
          subjectData: { fullName }
        })
      });

      const data = await res.json();
      if (data.success && data.credential) {
        onIssueSuccess(data.credential);
      }
    } catch (err) {
      console.error('Issuance error:', err);
    } finally {
      setIsIssuing(false);
    }
  };

  return (
    <div className="glass-panel p-5 flex flex-col gap-4 h-full border-t-4 border-t-cyan-500">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-100">1. Issuer Module</h2>
            <span className="text-xs text-slate-400 font-mono">OpenID4VCI • Draft 13</span>
          </div>
        </div>
        <span className="badge badge-cyan">Role: Issuer</span>
      </div>

      {/* Implementation Selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
          <span>Implementation:</span>
          <span className="text-[10px] text-cyan-400 font-mono">Matrix Selector</span>
        </label>
        <select
          value={implementation}
          onChange={(e) => setImplementation(e.target.value as any)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
        >
          <option value="INJI_CERTIFY">MOSIP Inji Certify (Docker :8090/:8091)</option>
          <option value="MOCK_EXTERNAL_OID4VCI">External Mock Issuer (Sphereon/Walt.id OID4VCI)</option>
        </select>
      </div>

      {/* Format Selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span>Credential Format & Type:</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setFormat('ldp_vc')}
            className={`p-2 rounded-lg text-[11px] font-medium border text-center transition-all ${
              format === 'ldp_vc'
                ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            W3C JSON-LD
            <span className="block text-[9px] opacity-75 font-mono">Ed25519</span>
          </button>
          <button
            type="button"
            onClick={() => setFormat('vc+sd-jwt')}
            className={`p-2 rounded-lg text-[11px] font-medium border text-center transition-all ${
              format === 'vc+sd-jwt'
                ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-sm'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            IETF SD-JWT
            <span className="block text-[9px] opacity-75 font-mono">Selective Disc</span>
          </button>
          <button
            type="button"
            onClick={() => setFormat('mso_mdoc')}
            className={`p-2 rounded-lg text-[11px] font-medium border text-center transition-all ${
              format === 'mso_mdoc'
                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-sm'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
            }`}
          >
            ISO mDoc/mDL
            <span className="block text-[9px] opacity-75 font-mono">ISO 18013-5</span>
          </button>
        </div>
      </div>

      {/* Input Fields */}
      <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/80 flex flex-col gap-2.5">
        <div>
          <label className="text-[11px] text-slate-400 block mb-1">Subject Name:</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-cyan-500"
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-400 block mb-1">National ID / UIN:</label>
          <input
            type="text"
            value={uin}
            onChange={(e) => setUin(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-md px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Trigger Button */}
      <button
        type="button"
        disabled={isIssuing}
        onClick={handleIssue}
        className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/20 transition-all disabled:opacity-50"
      >
        {isIssuing ? (
          <div className="flex items-center gap-2">
            <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
            <span>Orchestrating OpenID4VCI Flow...</span>
          </div>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            <span>Issue Credential via {implementation === 'INJI_CERTIFY' ? 'Inji Certify' : 'External Issuer'}</span>
            <ArrowRight className="w-4 h-4 ml-auto" />
          </>
        )}
      </button>

      {/* Metadata Tabs */}
      <div className="mt-auto flex flex-col gap-2">
        <div className="flex border-b border-slate-800 text-[11px]">
          <button
            onClick={() => setActiveTab('DISCOVERY')}
            className={`px-3 py-1.5 font-medium border-b-2 transition-colors ${
              activeTab === 'DISCOVERY' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400'
            }`}
          >
            .well-known Discovery
          </button>
          <button
            onClick={() => setActiveTab('DID')}
            className={`px-3 py-1.5 font-medium border-b-2 transition-colors ${
              activeTab === 'DID' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400'
            }`}
          >
            DID Document
          </button>
        </div>
        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 text-[10px] font-mono text-slate-300 max-h-32 overflow-y-auto">
          <pre>{JSON.stringify(activeTab === 'DISCOVERY' ? wellKnown : didDoc, null, 2) || 'Loading...'}</pre>
        </div>
      </div>
    </div>
  );
};
