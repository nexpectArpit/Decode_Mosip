import React from 'react';
import { motion } from 'framer-motion';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onOpenReport: () => void;
  onRefreshHealth?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenReport }) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-[#0B041A]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-[#951F6F]/30 shadow-xs transition-colors">
      <div className="max-w-[1680px] mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-4">
        {/* Brand Title */}
        <div>
          <h1 className="text-xl font-black text-[#002452] dark:text-white tracking-tight uppercase italic">
            Inji Interop Lab
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-0.5">
            Verifiable credential interoperability testbed across issuer · wallet · verifier
          </p>
        </div>

        {/* Right Controls: Theme Toggle & Audit Report Button */}
        <div className="flex items-center gap-3 md:gap-4 shrink-0">
          <ThemeToggle />

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.99 }}
            onClick={onOpenReport}
            className="bg-gradient-to-r from-[#F2680C] to-[#451691] dark:from-[#F2680C] dark:via-[#951F6F] dark:to-[#5B03AD] text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md border border-white/20 cursor-pointer"
          >
            <span>Run Interop Audit</span>
          </motion.button>
        </div>
      </div>
    </header>
  );
};
