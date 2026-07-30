/**
 * Theme system entry point
 * Re-exports types, themes, and utilities
 */

export type { Theme, ThemeColors, ThemeFont } from './types'

export {
  kubestellar,
  kubestellarClassic,
  batman,
  dracula,
  nord,
  tokyoNight,
  monokai,
  gruvbox,
  catppuccin,
  matrix,
  cyberpunk,
  solarizedDark,
  ocean,
  forest,
  sunset,
  rosePine,
  oneDark,
  kubestellarLight,
  githubLight,
  synthwave,
  nightOwl,
  ayuDark,
  palenight,
  horizon,
  shadesOfPurple,
  everforest,
  kanagawa,
  moonlight,
  cobalt2,
} from './catalog'

export { getCustomThemes, addCustomTheme, removeCustomTheme } from './storage'

import type { Theme } from './types'
import {
  kubestellar,
  kubestellarClassic,
  kubestellarLight,
  batman,
  dracula,
  nord,
  tokyoNight,
  monokai,
  gruvbox,
  catppuccin,
  matrix,
  cyberpunk,
  solarizedDark,
  ocean,
  forest,
  sunset,
  rosePine,
  oneDark,
  githubLight,
  synthwave,
  nightOwl,
  ayuDark,
  palenight,
  horizon,
  shadesOfPurple,
  everforest,
  kanagawa,
  moonlight,
  cobalt2,
} from './catalog'
import { getCustomThemes } from './storage'

export const themes: Theme[] = [
  kubestellar,
  kubestellarClassic,
  kubestellarLight,
  batman,
  dracula,
  nord,
  tokyoNight,
  monokai,
  gruvbox,
  catppuccin,
  matrix,
  cyberpunk,
  solarizedDark,
  ocean,
  forest,
  sunset,
  rosePine,
  oneDark,
  githubLight,
  synthwave,
  nightOwl,
  ayuDark,
  palenight,
  horizon,
  shadesOfPurple,
  everforest,
  kanagawa,
  moonlight,
  cobalt2,
]

export const themeGroups = [
  { name: 'KubeStellar', themes: ['kubestellar', 'kubestellar-classic', 'kubestellar-light'] },
  { name: 'Popular', themes: ['dracula', 'nord', 'tokyo-night', 'monokai', 'gruvbox', 'catppuccin'] },
  { name: 'Developer', themes: ['night-owl', 'cobalt2', 'shades-of-purple', 'palenight', 'ayu-dark'] },
  { name: 'Iconic', themes: ['batman', 'matrix', 'cyberpunk', 'synthwave'] },
  { name: 'Classic', themes: ['solarized-dark', 'one-dark', 'github-light'] },
  { name: 'Nature', themes: ['ocean', 'forest', 'sunset', 'rose-pine', 'everforest'] },
  { name: 'Aesthetic', themes: ['kanagawa', 'moonlight', 'horizon'] },
]

export function getAllThemes(): Theme[] {
  return [...themes, ...getCustomThemes()]
}

export function getThemeById(id: string): Theme | undefined {
  return getAllThemes().find(t => t.id === id)
}

export function getDefaultTheme(): Theme {
  return kubestellar
}
