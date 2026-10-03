import React, { useState } from 'react';
import { Cpu, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { CustomSelect, type SelectOption } from './CustomSelect';
import { formatCredentialTitle } from '../utils/format';

export type TamperAttackVector = 'NONE' | 'INVALID_SIGNATURE' | 'EXPIRED_CREDENTIAL' | 'ALTERED_CLAIMS' | 'MISMATCHED_NONCE';

interface VerifierColumnProps {
  selectedVc: any;
  onExecuteVerify: (implementation: 'INJI_VERIFY' | 'MOCK_EXTERNAL_OID4VP') => void;
  isVerifying: boolean;
  verificationResult: any;
  tamperScenario: TamperAttackVector;
  onChangeTamperScenario: (scenario: TamperAttackVector) => void;
}

export const VerifierColumn: React.FC<VerifierColumnProps> = ({
  selectedVc,
  onExecuteVerify,
  isVerifying,
  verificationResult,
  tamperScenario,
  onChangeTamperScenario
}) => {
  const [implementation, setImplementation] = useState<'INJI_VERIFY' | 'MOCK_EXTERNAL_OID4VP'>('INJI_VERIFY');

  const nodeOptions: SelectOption[] = [
    { value: 'INJI_VERIFY', label: 'Inji Verify (Docker :8095)' },
    { value: 'MOCK_EXTERNAL_OID4VP', label: 'External Mock Verifier (OID4VP)' }
  ];

  const attackOptions: SelectOption[] = [
    { value: 'NONE', label: 'Normal Verification (Happy Path)' },
    { value: 'INVALID_SIGNATURE', label: 'Tamper: Invalid Signature' },
    { value: 'EXPIRED_CREDENTIAL', label: 'Tamper: Expired Credential' },
    { value: 'ALTERED_CLAIMS', label: 'Tamper: Altered Claims' },
    { value: 'MISMATCHED_NONCE', label: 'Tamper: Replay Attack (Mismatched Nonce)' }
  ];

  return (
    <div className="inji-card flex flex-col h-full relative transition-colors">
      <div className="inji-card-header p-5 flex items-center justify-between">
        <div>
          <h2 className="font-extrabold text-[#002452] dark:text-[#C084FC] text-lg tracking-tight italic">VERIFIER</h2>
          <span className="text-xs text-[#451691] dark:text-[#C084FC] font-mono font-extrabold">Inji Verify</span>
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-purple-50 dark:bg-purple-900/60 text-purple-700 dark:text-[#E9D5FF] border border-purple-200 dark:border-purple-500/60 px-3 py-1 rounded-full">
          OpenID4VP
        </span>
      </div>

      <div className="p-5 flex flex-col gap-5 flex-1 justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-[#002452] dark:text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F2680C]" />
              <span>Verifier Node Target:</span>
            </label>
            <CustomSelect
              options={nodeOptions}
              value={implementation}
              onChange={(val) => setImplementation(val as any)}
            />
          </div>

          <div className="flex flex-col gap-1.5 text-xs">
            <label className="text-[#002452] dark:text-white font-extrabold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F2680C]" />
              <span>Target Credential for Verification:</span>
            </label>
            <div className="inji-subcard p-3.5 rounded-2xl flex items-center justify-between">
              {selectedVc ? (
                <span className="truncate font-sans text-xs text-slate-900 dark:text-white font-bold">
                  {formatCredentialTitle(selectedVc.type?.[1] || selectedVc.id)}
                </span>
              ) : (
                <span className="text-slate-500 dark:text-slate-300 text-[11px]">Select a credential in Column 2 to verify</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-extrabold text-[#002452] dark:text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#F2680C]" />
              <span>Verification Mode / Security Scenario:</span>
            </label>
            <CustomSelect
              options={attackOptions}
              value={tamperScenario}
              onChange={(val) => onChangeTamperScenario(val as TamperAttackVector)}
            />
          </div>

          {verificationResult && (
            <div className={`p-3.5 rounded-2xl border flex items-center justify-between font-mono text-xs shadow-xs ${
              verificationResult.valid
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700/60'
                : 'bg-red-50 text-red-800 border-red-300 dark:bg-red-950/80 dark:text-red-300 dark:border-red-700/60'
            }`}>
              <span className="font-bold">STATUS:</span>
              <span className="font-extrabold uppercase">
                {verificationResult.valid ? '✓ VALID (PASS)' : `✕ REJECTED (${verificationResult.status || 'FAIL'})`}
              </span>
            </div>
          )}
        </div>

        {/* Verify Action Button */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="button"
          onClick={() => onExecuteVerify(implementation)}
          disabled={!selectedVc || isVerifying}
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md border border-white/20 cursor-pointer"
        >
          {isVerifying ? (
            <>
              <Cpu className="w-4 h-4 animate-spin text-white" />
              <span>Verifying Cryptography...</span>
            </>
          ) : (
            <>
              <span>Verify Presentation</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
};
