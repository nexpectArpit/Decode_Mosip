import React from 'react';
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface InteropResult {
  status: 'PASS' | 'FAIL' | 'ERROR' | 'IDLE';
  issuer: string;
  wallet: string;
  verifier: string;
  format: string;
  attackVector: string;
  details?: any;
  failureStage?: string;
  errorMessage?: string;
}

interface ResultBannerProps {
  result: InteropResult;
  onViewTrace?: () => void;
}

export const ResultBanner: React.FC<ResultBannerProps> = ({ result, onViewTrace }) => {
  if (result.status === 'IDLE') {
    return null;
  }

  const isPass = result.status === 'PASS';
  const isError = result.status === 'ERROR';
  const verificationMode = result.wallet.startsWith('Local Reference Wallet') || result.wallet.startsWith('External wallet via QR')
    ? 'Signed OpenID4VP presentation' : 'Direct credential verification';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10 }}
        className={`p-4.5 mb-6 rounded-2xl border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-md dark:shadow-2xl transition-all ${
          isPass
            ? 'bg-emerald-50 dark:bg-gradient-to-r dark:from-[#0C1A14] dark:via-[#140A24] dark:to-[#0B041A] border-emerald-300 dark:border-[#1F9F60]/60 text-emerald-950 dark:text-white'
            : 'bg-red-50 dark:bg-gradient-to-r dark:from-[#22070E] dark:via-[#140A24] dark:to-[#0B041A] border-red-300 dark:border-red-500/60 text-red-950 dark:text-white'
        }`}
      >
        <div className="w-full min-w-0 flex-1 flex items-start sm:items-center gap-3.5">
          {isPass ? (
            <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-[#1F9F60] shrink-0" />
          ) : (
            <XCircle className="w-7 h-7 text-red-600 dark:text-red-500 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[10px] font-extrabold uppercase tracking-widest px-3 py-0.5 rounded-full border ${
                isPass ? 'bg-emerald-200 text-emerald-900 border-emerald-400 dark:bg-[#1F9F60]/20 dark:text-[#1F9F60] dark:border-[#1F9F60]/50' : 'bg-red-200 text-red-900 border-red-400 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/50'
              }`}>
                {isPass ? 'VERIFIED' : isError ? 'ERROR' : 'REJECTED'}
              </span>
              <span className="text-xs font-mono text-slate-600 dark:text-slate-300 font-semibold">
                {result.format.toUpperCase()} • {verificationMode}
              </span>
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mt-1 tracking-tight">
              {isPass ? 'CREDENTIAL VERIFIED' : isError ? 'VERIFICATION COULD NOT COMPLETE' : 'CREDENTIAL REJECTED'}
            </h2>
            <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 font-medium break-words">
              Flow: <strong className="text-[#F2680C]">{result.issuer}</strong> → <strong className="text-[#451691] dark:text-[#a855f7]">{result.wallet}</strong> → <strong className="text-purple-700 dark:text-purple-400">{result.verifier}</strong>
              {result.attackVector !== 'NONE' && (
                <span className="ml-2 text-red-600 dark:text-red-400 font-mono font-bold">
                  (Attack Vector: {result.attackVector})
                </span>
              )}
            </p>
            {result.errorMessage && <p className="text-xs text-red-700 dark:text-red-300 mt-1">{result.errorMessage}</p>}
          </div>
        </div>

        <div className="w-full sm:w-auto flex items-center justify-end gap-3">
          <div className="text-right font-mono text-xs hidden sm:block">
            <div className="text-slate-500 dark:text-slate-400 text-[10px] font-bold">VERIFICATION OUTCOME</div>
            <div className={`font-bold ${isPass ? 'text-emerald-700 dark:text-[#1F9F60]' : 'text-red-700 dark:text-red-400'}`}>
              {isPass ? 'VALID' : isError ? 'NO VERDICT' : 'INVALID'}
            </div>
          </div>
          {onViewTrace && (
            <button
              onClick={onViewTrace}
              className="bg-slate-900 hover:bg-slate-800 dark:bg-gradient-to-r dark:from-[#F2680C] dark:to-[#951F6F] text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 shadow-md cursor-pointer border border-white/20"
            >
              <span>Inspect Raw Traces</span>
              <ArrowRight className="w-3.5 h-3.5 text-blue-400 dark:text-white" />
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
