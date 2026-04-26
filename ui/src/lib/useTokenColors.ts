import { useTheme } from "@/store/themeStore";

export interface TokenColors {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  primary: string;
  accent: string;
  danger: string;
  text: string;
  textMuted: string;
  pieceGrain: string;
  pieceFree: string;
  offcut: string;
}

const LIGHT: TokenColors = {
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  surface2: "#F2F1EC",
  border: "#E3E1DA",
  primary: "#0E6F5C",
  accent: "#C9772E",
  danger: "#C14A3C",
  text: "#1A1A1A",
  textMuted: "#6B6B6B",
  pieceGrain: "#D4E2D0",
  pieceFree: "#E8DDC8",
  offcut: "#B97DD4",
};

const DARK: TokenColors = {
  bg: "#0F1115",
  surface: "#181B21",
  surface2: "#20242C",
  border: "#2A2F39",
  primary: "#1BA88A",
  accent: "#E89552",
  danger: "#E06A5A",
  text: "#E8E8E6",
  textMuted: "#8A8F9A",
  pieceGrain: "#2F4A3A",
  pieceFree: "#4A3F2F",
  offcut: "#8E5BAC",
};

export function useTokenColors(): TokenColors {
  const { resolved } = useTheme();
  return resolved === "dark" ? DARK : LIGHT;
}
