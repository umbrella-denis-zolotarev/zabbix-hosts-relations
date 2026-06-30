import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ConfigProvider, theme as antdTheme } from "antd";

export type ThemeMode = "light" | "dark";

const STORAGE_KEY = "app-theme";
const FULL_WIDTH_KEY = "app-full-width";

/** Max content width (px) when not in full-width mode. */
export const CONTENT_MAX_WIDTH = 1024;

function getSystemTheme(): ThemeMode {
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function getInitialTheme(): ThemeMode {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  }
  // Fall back to the OS preference when nothing is saved yet.
  return getSystemTheme();
}

function getInitialFullWidth(): boolean {
  if (typeof window !== "undefined") {
    return window.localStorage.getItem(FULL_WIDTH_KEY) === "true";
  }
  // Default: constrained width (not full-width).
  return false;
}

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
  fullWidth: boolean;
  setFullWidth: (fullWidth: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getInitialTheme);
  const [fullWidth, setFullWidthState] = useState<boolean>(getInitialFullWidth);

  const setFullWidth = useCallback((next: boolean) => {
    setFullWidthState(next);
    try {
      window.localStorage.setItem(FULL_WIDTH_KEY, String(next));
    } catch {
      // Ignore storage errors.
    }
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage errors (e.g. private mode / disabled storage).
    }
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Ignore storage errors.
      }
      return next;
    });
  }, []);

  // Keep <html> in sync so non-AntD surfaces (scrollbars, body bg) match.
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  const value = useMemo(
    () => ({ mode, setMode, toggle, fullWidth, setFullWidth }),
    [mode, setMode, toggle, fullWidth, setFullWidth],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          algorithm:
            mode === "dark"
              ? antdTheme.darkAlgorithm
              : antdTheme.defaultAlgorithm,
        }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}