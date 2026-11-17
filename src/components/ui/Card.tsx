import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'heritage' | 'bordered';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  className = '',
  ...props
}) => {
  const baseStyles = 'rounded-xl transition-colors';

  const variantStyles = {
    default:
      'bg-white dark:bg-[#141720] border border-slate-200/90 dark:border-[#232938] shadow-2xs',
    elevated:
      'bg-white dark:bg-[#141720] border border-slate-200 dark:border-[#232938] shadow-md',
    heritage:
      'bg-[#F7F2E3]/70 dark:bg-[#191B18] border border-[#A67C00]/40 dark:border-amber-700/40 shadow-2xs',
    bordered:
      'bg-slate-50/80 dark:bg-[#11141C] border border-slate-200 dark:border-[#232938]',
  }[variant];

  return (
    <div className={`${baseStyles} ${variantStyles} ${className}`} {...props}>
      {children}
    </div>
  );
};
