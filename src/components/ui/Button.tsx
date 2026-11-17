import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'heritage' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-bold transition-colors rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.99]';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-xs sm:text-sm gap-2',
    lg: 'px-5 py-3 text-sm sm:text-base gap-2.5',
  }[size];

  const variantStyles = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-2xs',
    secondary:
      'bg-slate-100 hover:bg-slate-200 dark:bg-[#1E2433] dark:hover:bg-[#272E40] text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-[#2A3142]',
    heritage:
      'bg-[#0B4F2C] hover:bg-[#146C3E] text-white border border-[#A67C00]/40 shadow-2xs',
    outline:
      'bg-white hover:bg-slate-50 dark:bg-[#141720] dark:hover:bg-[#1A1F2B] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#252B3B]',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-2xs',
    ghost:
      'bg-transparent hover:bg-slate-100 dark:hover:bg-[#1E2433] text-slate-700 dark:text-slate-300',
  }[variant];

  return (
    <button
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
};
