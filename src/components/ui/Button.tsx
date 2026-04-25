"use client";

import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  leftIcon?: React.ReactNode;
  loading?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "rounded-full bg-brand text-white shadow-lg shadow-brand/20 hover:bg-brand-dark focus:ring-brand/50 disabled:opacity-50",
  secondary:
    "rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-700 focus:ring-zinc-500",
  ghost:
    "rounded-lg text-zinc-300 hover:bg-zinc-800 hover:text-white focus:ring-zinc-600",
  danger:
    "rounded-lg bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:opacity-50",
};

export function Button({
  variant = "primary",
  leftIcon,
  loading,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {loading ? (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        leftIcon
      )}
      {children}
    </button>
  );
}
