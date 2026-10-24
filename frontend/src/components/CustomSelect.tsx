import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { motion } from 'framer-motion';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ options, value, onChange, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((option) => option.value === value) || options[0];

  const updateMenuPosition = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const gap = 8;
    const maxHeight = 288;
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const availableHeight = Math.max(96, Math.min(maxHeight, openAbove ? spaceAbove : spaceBelow));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));

    setMenuStyle({
      position: 'fixed',
      top: openAbove ? Math.max(8, rect.top - availableHeight - gap) : rect.bottom + gap,
      left,
      width: Math.min(rect.width, window.innerWidth - 16),
      maxHeight: availableHeight,
      zIndex: 1000
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => updateMenuPosition();
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const path = event.composedPath();
      if (buttonRef.current && path.includes(buttonRef.current)) return;
      if (menuRef.current && path.includes(menuRef.current)) return;
      setIsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  return (
    <div className={`relative w-full ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }
          updateMenuPosition();
          setIsOpen(true);
        }}
        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border-2 text-xs font-extrabold transition-all cursor-pointer bg-white dark:bg-[#140A24] text-[#002452] dark:text-white ${
          isOpen
            ? 'border-[#0076FF] dark:border-[#F2680C] shadow-md ring-2 ring-[#0076FF]/20 dark:ring-[#F2680C]/20'
            : 'border-[#0076FF]/80 dark:border-[#951F6F]/50 hover:border-[#0076FF] dark:hover:border-[#F2680C]'
        }`}
      >
        <span className="truncate">{selectedOption?.label}</span>
        <ChevronDown className={`w-4 h-4 text-[#0076FF] dark:text-[#F2680C] transition-transform duration-200 shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && createPortal(
        <motion.div
          ref={menuRef}
          role="listbox"
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.15 }}
          style={menuStyle}
          className="bg-[#0099FF] dark:bg-[#140A24] text-white rounded-2xl shadow-2xl border border-white/20 dark:border-[#951F6F]/50 py-2 overflow-x-hidden overflow-y-auto"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-5 py-3 text-xs font-bold transition-all text-left ${
                  option.disabled
                    ? 'text-white/55 cursor-not-allowed'
                    : isSelected
                      ? 'bg-white/25 dark:bg-gradient-to-r dark:from-[#F2680C]/80 dark:to-[#951F6F]/80 text-white font-black cursor-pointer'
                      : 'text-white/90 dark:text-slate-300 hover:bg-white/15 dark:hover:bg-[#25123E] hover:text-white cursor-pointer'
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check className="w-4 h-4 text-white shrink-0 ml-2" />}
              </button>
            );
          })}
        </motion.div>,
        document.body
      )}
    </div>
  );
};
