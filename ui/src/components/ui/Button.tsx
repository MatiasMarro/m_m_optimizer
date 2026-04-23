import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const styles: Record<Variant, string> = {
  primary: "bg-primary text-white hover:opacity-90",
  secondary: "bg-surface-2 text-text hover:bg-border",
  ghost: "text-text hover:bg-surface-2",
  danger: "bg-danger text-white hover:opacity-90",
};

export default function Button({ variant = "primary", className = "", children, ...rest }: Props) {
  return (
    <button
      className={`inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
