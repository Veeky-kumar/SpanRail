// Theme choice for the app. Light is the default; the choice lives in a cookie so the server can
// put it on <html data-theme> before first paint (no flash of the wrong theme).
export type ThemeChoice = "light" | "dark" | "system";

export const THEME_COOKIE = "tw-theme";

const CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"];

/** The cookie is user-controlled and ends up in an HTML attribute, so only known values pass. */
export function resolveTheme(value: string | null | undefined): ThemeChoice {
  return CHOICES.find((c) => c === value) ?? "light";
}

/** Cookie string for document.cookie. Not sensitive, so it is readable by script on purpose. */
export function themeCookie(choice: ThemeChoice): string {
  return `${THEME_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax`;
}
