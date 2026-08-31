export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'system'

export function readThemeCookie(value: string | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME
}
