import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface CustomSelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

interface CustomSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<CustomSelectOption<T>>;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  menuPlacement?: 'top' | 'bottom';
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export function CustomSelect<T extends string = string>({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = 'اختر...',
  className = '',
  menuPlacement = 'bottom',
  size = 'sm',
  disabled = false,
}: CustomSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % Math.max(1, options.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev <= 0 ? Math.max(0, options.length - 1) : prev - 1
        );
      } else if (e.key === 'Enter' && highlightedIndex >= 0 && options[highlightedIndex]) {
        e.preventDefault();
        onChange(options[highlightedIndex].value);
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, highlightedIndex, options, onChange]);

  const toggleOpen = () => {
    if (disabled) return;
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        const idx = options.findIndex((o) => o.value === value);
        setHighlightedIndex(idx >= 0 ? idx : 0);
      }
      return next;
    });
  };

  const sizeClasses =
    size === 'md'
      ? 'px-3 py-2 text-xs sm:text-sm min-h-[38px]'
      : 'px-2.5 py-1.5 text-xs min-h-[32px]';

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggleOpen}
        className={`w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#171B26] hover:bg-slate-50 dark:hover:bg-[#1D2230] text-slate-800 dark:text-slate-100 font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${sizeClasses}`}
      >
        <span className="truncate text-right">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className={`absolute z-50 w-full min-w-[210px] rounded-xl border border-slate-200 dark:border-[#2A3142] bg-white dark:bg-[#151923] shadow-xl py-1 max-h-64 overflow-y-auto ${
            menuPlacement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } right-0`}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIndex;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setHighlightedIndex(idx)}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-right px-3 py-2 flex items-start justify-between gap-2 text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold'
                    : isHighlighted
                    ? 'bg-slate-100 dark:bg-[#1E2433] text-slate-900 dark:text-slate-100'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1A202E]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">{opt.label}</div>
                  {opt.description && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5 leading-snug">
                      {opt.description}
                    </div>
                  )}
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
