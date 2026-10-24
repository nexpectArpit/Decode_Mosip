import React from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onOpenReport: () => void;
  onOpenOverview?: () => void;
  onReplayTour?: () => void;
  showWorkspaceActions?: boolean;
  onRefreshHealth?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenReport, onOpenOverview, onReplayTour, showWorkspaceActions = true }) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-[#0B041A]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-[#951F6F]/30 shadow-xs transition-colors">
      <div className="w-full max-w-[1680px] mx-auto px-5 sm:px-4 md:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        {/* Brand Title */}
        <div className="min-w-0 sm:flex-1">
          <h1 className="text-xl font-black text-[#002452] dark:text-white tracking-tight uppercase italic">
            Inji Interop Lab
          </h1>
          <p className="text-[11px] sm:text-xs leading-snug text-slate-600 dark:text-slate-300 font-medium mt-0.5">
            Verifiable credential interoperability testbed across issuer · wallet · verifier
          </p>
        </div>

        {/* Right Controls: Theme Toggle & Audit Report Button */}
        <div className="w-full sm:w-auto flex flex-col min-[480px]:flex-row items-stretch min-[480px]:items-center justify-between sm:justify-end gap-2 sm:gap-3 md:gap-4 shrink-0">
          {onOpenOverview && <button type="button" onClick={onOpenOverview} className="w-full min-[480px]:w-auto rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-orange-400 dark:border-purple-800 dark:bg-[#190D2E] dark:text-slate-200">Overview</button>}
          <ThemeToggle />

          {onReplayTour && <button type="button" onClick={onReplayTour} className="w-full min-[480px]:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-orange-400/50 bg-orange-50 px-4 py-2.5 text-xs font-bold text-orange-800 transition hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-950/30 dark:text-orange-200 dark:hover:bg-orange-950/60"><RotateCcw className="h-3.5 w-3.5" />Replay tour</button>}

          {showWorkspaceActions && <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.99 }}
            onClick={onOpenReport}
            className="w-full min-[480px]:w-auto flex items-center justify-center bg-gradient-to-r from-[#F2680C] to-[#451691] dark:from-[#F2680C] dark:via-[#951F6F] dark:to-[#5B03AD] text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md border border-white/20 cursor-pointer"
          >
            <span>Run Interop Audit</span>
          </motion.button>}
        </div>
      </div>
    </header>
  );
};
