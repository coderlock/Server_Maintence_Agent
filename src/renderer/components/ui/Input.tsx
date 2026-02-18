/**
 * Input Component
 * Simple text input
 */

import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-sm font-medium text-vscode-text">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            px-3 py-2 text-sm
            bg-[#3c3c3c] text-vscode-text
            border border-[#3c3c3c]
            rounded
            focus:outline-none focus:ring-1 focus:ring-vscode-accent focus:border-vscode-accent
            disabled:opacity-50 disabled:cursor-not-allowed
            ${error ? 'border-red-500' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <span className="text-xs text-red-500">{error}</span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
