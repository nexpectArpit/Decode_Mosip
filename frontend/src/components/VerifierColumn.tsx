import React, { Suspense, useState } from 'react';
import { Cpu, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { CustomSelect, type SelectOption } from './CustomSelect';
import { formatCredentialTitle } from '../utils/format';

const InjiVerifySdkPanel = React.lazy(() => import('./InjiVerifySdkPanel').then(module => ({ default: module.InjiVerifySdkPanel })));

export type TamperAttackVector = 'NONE' | 'INVALID_SIGNATURE' | 'EXPIRED_CREDENTIAL' | 'ALTERED_CLAIMS' | 'CORRUPTED_DISCLOSURE' | 'MISMATCHED_NONCE';

interface VerifierColumnProps {
  walletType: 'INJI_WEB' | 'PLAYGROUND_BROWSER_VAULT' | 'INJI_MOBILE' | 'MOCK_EXTERNAL_WALLET';
  selectedVc: any;
  implementation: 'INJI_VERIFY' | 'MOCK_EXTERNAL_OID4VP';
  onChangeImplementation: (implementation: 'INJI_VERIFY' | 'MOCK_EXTERNAL_OID4VP') => void;
  onExecuteVerify: (implementation: 'INJI_VERIFY' | 'MOCK_EXTERNAL_OID4VP') => void;
  isVerifying: boolean;
  verificationResult: any;
  tamperScenario: TamperAttackVector;
  onChangeTamperScenario: (scenario: TamperAttackVector) => void;
  onMobileVPStarted: () => void;
  onMobileVPResult: (result: any | null, error?: string) => void;
  onMobileTransactionReceived: (transactionId: string) => void;
}

export const VerifierColumn: React.FC<VerifierColumnProps> = ({
  walletType,
  selectedVc,
  implementation,
  onChangeImplementation,
  onExecuteVerify,
  isVerifying,
  verificationResult,
  tamperScenario,
  onChangeTamperScenario,
  onMobileVPStarted,
  onMobileVPResult,
  onMobileTransactionReceived
}) => {
  const [sdkPreference, setSdkPreference] = useState<{ selection: string; visible: boolean } | null>(null);
  const sdkSelection = `${walletType}:${implementation}`;
  const showSdk = sdkPreference?.selection === sdkSelection
    ? sdkPreference.visible
    : walletType === 'INJI_MOBILE' && implementation === 'INJI_VERIFY';

  const nodeOptions: SelectOption[] = [
    { value: 'INJI_VERIFY', label: 'Inji Verify (Docker :8095)' },
    { value: 'MOCK_EXTERNAL_OID4VP', label: 'Local Mock Crypto Verifier' }
  ];

  const attackOptions: SelectOption[] = [
    { value: 'NONE', label: 'Normal Verification (Happy Path)' },
    { value: 'INVALID_SIGNATURE', label: 'Tamper: Invalid Signature' },
    { value: 'EXPIRED_CREDENTIAL', label: 'Tamper: Expired Credential' },
    { value: 'ALTERED_CLAIMS', label: 'Tamper: Altered Claims' },
    { value: 'CORRUPTED_DISCLOSURE', label: 'Tamper: Corrupted Disclosure' },
    { value: 'MISMATCHED_NONCE', label: 'Replay: Mismatched VP Nonce' }
  ];
  const availableAttackOptions = walletType === 'INJI_MOBILE' || walletType === 'INJI_WEB'
    ? attackOptions.filter(option => option.value === 'NONE')
    : attackOptions;

  const format = selectedVc?.format || 'ldp_vc';
  const flowSupported = !selectedVc ? false : tamperScenario === 'MISMATCHED_NONCE'
    ? walletType === 'MOCK_EXTERNAL_WALLET' && (
      (implementation === 'INJI_VERIFY' && format === 'ldp_vc') ||
      (implementation === 'MOCK_EXTERNAL_OID4VP' && format === 'vc+sd-jwt'))
    : tamperScenario === 'CORRUPTED_DISCLOSURE'
      ? format === 'vc+sd-jwt'
      : tamperScenario === 'ALTERED_CLAIMS'
        ? format === 'ldp_vc'
        : tamperScenario === 'EXPIRED_CREDENTIAL'
          ? format !== 'mso_mdoc'
          : implementation !== 'INJI_VERIFY' || format === 'ldp_vc' || format === 'vc+sd-jwt';

  return (
    <div className="inji-card min-w-0 flex flex-col h-full relative transition-colors">
      <div className="inji-card-header p-5 flex items-center justify-between">
        <div>
          <h2 className="font-extrabold text-[#002452] dark:text-[#C084FC] text-lg tracking-tight italic">VERIFIER</h2>
          <span className="text-xs text-[#451691] dark:text-[#C084FC] font-mono font-extrabold">{implementation === 'INJI_VERIFY' ? 'Inji Verify' : 'Local Mock Crypto Verifier'}</span>
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-purple-50 dark:bg-purple-900/60 text-purple-700 dark:text-[#E9D5FF] border border-purple-200 dark:border-purple-500/60 px-3 py-1 rounded-full">
          VC Verification
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
              onChange={(val) => onChangeImplementation(val as 'INJI_VERIFY' | 'MOCK_EXTERNAL_OID4VP')}
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
              options={availableAttackOptions}
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
          {selectedVc && !flowSupported && (
            <p role="status" className="text-[11px] text-amber-700 dark:text-amber-300">
              {tamperScenario === 'MISMATCHED_NONCE'
                ? 'Nonce replay testing requires a signed OpenID4VP presentation. Select the Local Reference Wallet with Inji Verify (W3C VC) or the Local Mock Crypto Verifier (SD-JWT VC).'
                : walletType === 'INJI_MOBILE' || walletType === 'INJI_WEB'
                  ? 'Attack injection is unavailable for the existing Inji wallet flow. Choose Normal Verification to use the wallet’s native presentation.'
                  : `This verifier and security scenario do not support ${format}. Choose Inji Verify for W3C VC or SD-JWT, or the local verifier for mDoc.`}
            </p>
          )}
          {implementation === 'INJI_VERIFY' && (
            <button type="button" onClick={() => setSdkPreference({ selection: sdkSelection, visible: !showSdk })} aria-expanded={showSdk}
              className="w-full rounded-xl border border-[#451691]/30 p-2.5 text-xs font-bold text-[#451691] dark:text-[#C084FC]">
              {showSdk ? 'Hide Official Inji Verify SDK' : 'Open Official Inji Verify SDK'}
            </button>
          )}
          {implementation === 'INJI_VERIFY' && showSdk && (
            <Suspense fallback={<div className="inji-subcard rounded-2xl p-4 text-xs">Loading Inji Verify SDK…</div>}>
              <InjiVerifySdkPanel onVPStarted={onMobileVPStarted} onVPResult={onMobileVPResult}
                onTransactionReceived={onMobileTransactionReceived} />
            </Suspense>
          )}
        </div>

        {/* Verify Action Button */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="button"
          onClick={() => onExecuteVerify(implementation)}
          disabled={!selectedVc || !flowSupported || isVerifying}
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md border border-white/20 cursor-pointer"
        >
          {isVerifying ? (
            <>
              <Cpu className="w-4 h-4 animate-spin text-white" />
              <span>Verifying Cryptography...</span>
            </>
          ) : (
            <>
          <span>Verify Credential</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
};
