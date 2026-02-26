/**
 * Button Component
 * Simple button with variants
 */

import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'default',
  size = 'md',
  className = '',
  children,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center rounded font-medium transition-colors focus outline-none disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantStyles = {
    default: 'bg-vscode-accent hover:bg-[#005a9e] text-white',
    ghost: 'bg-transparent hover:bg-[#2a2d2e] text-vscode-text',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };
  
  const sizeStyles = {
    sm: 'px-2 py-1 text-sm h-7',
    md: 'px-3 py-2 text-sm h-9',
    lg: 'px-4 py-2 text-base h-11',
  };
  
  const classes = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`;
  
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
};
