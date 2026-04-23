"use client";

import React from "react";

type BadgeVariant = "default" | "blue" | "green" | "red" | "orange" | "purple" | "teal" | "gray";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-zinc-800 text-zinc-300 border-zinc-700",
  gray: "bg-zinc-800 text-zinc-300 border-zinc-700",
  blue: "bg-blue-950/60 text-blue-300 border-blue-800/50",
  green: "bg-green-950/60 text-green-300 border-green-800/50",
  red: "bg-red-950/60 text-red-300 border-red-800/50",
  orange: "bg-orange-950/60 text-orange-300 border-orange-800/50",
  purple: "bg-purple-950/60 text-purple-300 border-purple-800/50",
  teal: "bg-teal-950/60 text-teal-300 border-teal-800/50",
};

export function Badge({ children, variant = "default", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
