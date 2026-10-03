import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 text-xs font-extrabold transition-all cursor-pointer bg-white dark:bg-[#140A24] text-[#002452] dark:text-white ${
          isOpen
            ? 'border-[#0076FF] dark:border-[#F2680C] shadow-md ring-2 ring-[#0076FF]/20 dark:ring-[#F2680C]/20'
            : 'border-[#0076FF]/80 dark:border-[#951F6F]/50 hover:border-[#0076FF] dark:hover:border-[#F2680C]'
        }`}
      >
        <span className="truncate">{selectedOption?.label}</span>
        <ChevronDown
          className={`w-4 h-4 text-[#0076FF] dark:text-[#F2680C] transition-transform duration-200 shrink-0 ml-2 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#0099FF] dark:bg-[#140A24] text-white rounded-2xl shadow-2xl border border-white/20 dark:border-[#951F6F]/50 py-2 overflow-hidden max-h-72 overflow-y-auto"
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-5 py-3 text-xs font-bold transition-all text-left cursor-pointer ${
                    isSelected
                      ? 'bg-white/25 dark:bg-gradient-to-r dark:from-[#F2680C]/80 dark:to-[#951F6F]/80 text-white font-black'
                      : 'text-white/90 dark:text-slate-300 hover:bg-white/15 dark:hover:bg-[#25123E] hover:text-white'
                  }`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check className="w-4 h-4 text-white shrink-0 ml-2" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
