import React, { useState } from 'react';
import { ShieldCheck, XCircle, CheckCircle2, ShieldAlert, Cpu } from 'lucide-react';

interface VerifierColumnProps {
  selectedVc: any;
}

export const VerifierColumn: React.FC<VerifierColumnProps> = ({ selectedVc }) => {
  const [implementation, setImplementation] = useState<'INJI_VERIFY' | 'MOCK_EXTERNAL_OID4VP'>('INJI_VERIFY');
  const [tamperScenario, setTamperScenario] = useState<
    'NONE' | 'INVALID_SIGNATURE' | 'EXPIRED_CREDENTIAL' | 'ALTERED_CLAIMS' | 'MISMATCHED_NONCE'
  >('NONE');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  const handleVerify = async () => {
    if (!selectedVc) return;
    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const res = await fetch('http://localhost:4000/api/verifier/verify-vc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vc: selectedVc,
          verifierImplementation: implementation,
          tamperScenario
        })
      });

      const data = await res.json();
      setVerificationResult(data);
    } catch (err) {
      console.error('Verification error:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="glass-panel p-5 flex flex-col gap-4 h-full border-t-4 border-t-emerald-500">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-100">3. Verifier Module</h2>
            <span className="text-xs text-slate-400 font-mono">OpenID4VP • Draft 21-23</span>
          </div>
        </div>
        <span className="badge badge-emerald">Role: Verifier</span>
      </div>

      {/* Verifier Selector */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
          <span>Verifier Implementation:</span>
          <span className="text-[10px] text-emerald-400 font-mono">Relying Party</span>
        </label>
        <select
          value={implementation}
          onChange={(e) => setImplementation(e.target.value as any)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
        >
          <option value="INJI_VERIFY">MOSIP Inji Verify (Docker :8095)</option>
          <option value="MOCK_EXTERNAL_OID4VP">External Mock Verifier (Sphereon/Walt.id OID4VP)</option>
        </select>
      </div>

      {/* Replay & Tamper Mode Selector */}
      <div className="bg-slate-950/70 p-3.5 rounded-xl border border-red-500/20 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-red-400 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4" />
            Replay & Tamper Test Simulator:
          </span>
          <span className="text-[10px] text-slate-400 font-mono">Negative Path</span>
        </div>
        <select
          value={tamperScenario}
          onChange={(e) => setTamperScenario(e.target.value as any)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-red-500 font-mono"
        >
          <option value="NONE">NONE (Legitimate Credential - Expected PASS)</option>
          <option value="INVALID_SIGNATURE">INVALID_SIGNATURE (Corrupt cryptographic proof bytes)</option>
          <option value="EXPIRED_CREDENTIAL">EXPIRED_CREDENTIAL (Set exp to past date)</option>
          <option value="ALTERED_CLAIMS">ALTERED_CLAIMS (Modify claims without key)</option>
          <option value="MISMATCHED_NONCE">MISMATCHED_NONCE (Simulate Replay Attack)</option>
        </select>
        <p className="text-[10px] text-slate-400 italic">
          {tamperScenario === 'NONE'
            ? 'Evaluates standard happy path cryptographic trust chain.'
            : 'Tests Inji Verify defensive rejection of tampered tokens.'}
        </p>
      </div>

      {/* Selected Credential Preview */}
      <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800 text-xs">
        <span className="text-slate-400 block text-[11px] mb-1">Target Verifiable Credential:</span>
        {selectedVc ? (
          <div className="flex items-center justify-between font-mono text-slate-200 text-[11px]">
            <span className="truncate max-w-[190px]">{selectedVc.id}</span>
            <span className="badge badge-indigo text-[9px] uppercase">{selectedVc.format}</span>
          </div>
        ) : (
          <span className="text-slate-500 italic text-[11px]">
            Select a credential in Column 2 to verify.
          </span>
        )}
      </div>

      {/* Verify Action Button */}
      <button
        type="button"
        disabled={!selectedVc || isVerifying}
        onClick={handleVerify}
        className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all disabled:opacity-40"
      >
        {isVerifying ? (
          <div className="flex items-center gap-2">
            <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
            <span>Verifying Cryptographic Proofs...</span>
          </div>
        ) : (
          <>
            <Cpu className="w-4 h-4" />
            <span>
              {tamperScenario === 'NONE' ? 'Execute OpenID4VP Verification' : 'Run Defensive Tamper Test'}
            </span>
          </>
        )}
      </button>

      {/* Verification Results Panel */}
      <div className="mt-auto flex flex-col gap-2">
        <span className="text-xs font-semibold text-slate-300">Verification Outcome:</span>
        {verificationResult ? (
          <div
            className={`p-3.5 rounded-xl border flex flex-col gap-2.5 ${
              verificationResult.valid
                ? 'bg-emerald-950/30 border-emerald-500/40'
                : 'bg-red-950/30 border-red-500/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-xs">
                {verificationResult.valid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">STATUS: VERIFIED (VALID)</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-red-300">STATUS: {verificationResult.status}</span>
                  </>
                )}
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {verificationResult.durationMs}ms
              </span>
            </div>

            <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-[11px] font-mono space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Signature Valid:</span>
                <span className={verificationResult.cryptographicCheck?.signatureValid ? 'text-emerald-400' : 'text-red-400'}>
                  {String(verificationResult.cryptographicCheck?.signatureValid)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Temporal Validity:</span>
                <span className={verificationResult.claimsCheck?.notExpired ? 'text-emerald-400' : 'text-amber-400'}>
                  {verificationResult.claimsCheck?.notExpired ? 'NOT EXPIRED' : 'EXPIRED'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tamper Detected:</span>
                <span className={verificationResult.cryptographicCheck?.tamperDetected ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                  {String(verificationResult.cryptographicCheck?.tamperDetected)}
                </span>
              </div>
            </div>

            <p className="text-[10px] text-slate-300 italic">
              {verificationResult.cryptographicCheck?.message}
            </p>
          </div>
        ) : (
          <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
            Awaiting verification submission...
          </div>
        )}
      </div>
    </div>
  );
};
