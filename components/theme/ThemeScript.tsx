import React from "react";
import { THEME_STORAGE_KEY, DEFAULT_THEME } from "@/config/themes";

/**
 * Blocking script injected into <head> to read saved theme preference
 * before initial paint, eliminating Flash of Unstyled Content (FOUC).
 */
export function ThemeScript() {
  const code = `
    (function() {
      try {
        var storageKey = '${THEME_STORAGE_KEY}';
        var defaultTheme = '${DEFAULT_THEME}';
        var storedPreference = localStorage.getItem(storageKey);
        var activeTheme = defaultTheme;

        if (storedPreference === 'system' || !storedPreference) {
          var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          activeTheme = systemDark ? 'dark' : 'light';
        } else if (['light', 'dark', 'midnight', 'professional'].indexOf(storedPreference) !== -1) {
          activeTheme = storedPreference;
        }

        document.documentElement.setAttribute('data-theme', activeTheme);
      } catch (e) {
        document.documentElement.setAttribute('data-theme', '${DEFAULT_THEME}');
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
