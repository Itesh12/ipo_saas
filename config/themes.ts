export type Theme = "light" | "dark" | "midnight" | "professional";
export type ThemePreference = Theme | "system";

export interface ThemeConfig {
  id: Theme;
  label: string;
  description: string;
  previewColor: string;
  accentColor: string;
}

export const THEMES: Record<Theme, ThemeConfig> = {
  light: {
    id: "light",
    label: "Light",
    description: "Clean, high-contrast fintech aesthetic",
    previewColor: "#f8fafc",
    accentColor: "#2563eb",
  },
  dark: {
    id: "dark",
    label: "Dark",
    description: "Sleek graphite interface for focused research",
    previewColor: "#090d16",
    accentColor: "#3b82f6",
  },
  midnight: {
    id: "midnight",
    label: "Midnight",
    description: "Deep obsidian theme optimized for charts and analytics",
    previewColor: "#030712",
    accentColor: "#06b6d4",
  },
  professional: {
    id: "professional",
    label: "Professional",
    description: "Corporate slate & sapphire tone for institutional feel",
    previewColor: "#f1f5f9",
    accentColor: "#1e3a8a",
  },
};

export const THEME_LIST = Object.values(THEMES);

export const THEME_STORAGE_KEY = "ipo_theme_preference";
export const DEFAULT_THEME: Theme = "dark";
