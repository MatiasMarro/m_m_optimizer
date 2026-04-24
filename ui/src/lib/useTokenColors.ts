import { useEffect, useState } from "react";

export interface TokenColors {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  pieceGrain: string;
  pieceFree: string;
  offcut: string;
}

const VARS: Record<keyof TokenColors, string> = {
  bg: "--bg",
  surface: "--surface",
  surface2: "--surface-2",
  border: "--border",
  primary: "--primary",
  accent: "--accent",
  text: "--text",
  textMuted: "--text-muted",
  pieceGrain: "--piece-grain",
  pieceFree: "--piece-free",
  offcut: "--offcut",
};

function readTokens(): TokenColors {
  if (typeof window === "undefined") {
    return {
      bg: "#FAFAF7", surface: "#FFFFFF", surface2: "#F2F1EC", border: "#E3E1DA",
      primary: "#0E6F5C", accent: "#C9772E", text: "#1A1A1A", textMuted: "#6B6B6B",
      pieceGrain: "#D4E2D0", pieceFree: "#E8DDC8", offcut: "#B97DD4",
    };
  }
  const cs = getComputedStyle(document.documentElement);
  const out = {} as TokenColors;
  (Object.keys(VARS) as (keyof TokenColors)[]).forEach((key) => {
    out[key] = cs.getPropertyValue(VARS[key]).trim();
  });
  return out;
}

export function useTokenColors(): TokenColors {
  const [tokens, setTokens] = useState<TokenColors>(() => readTokens());

  useEffect(() => {
    setTokens(readTokens());
    const target = document.documentElement;
    const observer = new MutationObserver(() => setTokens(readTokens()));
    observer.observe(target, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    return () => observer.disconnect();
  }, []);

  return tokens;
}
