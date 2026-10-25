// The built-in themes, in picker order. Each has src/themes/<id>.css with a dark and a light token set; the swatch
// (background, accent, green, red of the dark variant) previews it in the theme menu.
import type { ThemeInfo } from '../lib/appearance';

export const THEMES: ThemeInfo[] = [
  { id: 'default', name: 'Default', swatch: ['#0d1117', '#58a6ff', '#3fb950', '#f85149'] },
  { id: 'nord', name: 'Nord', swatch: ['#2e3440', '#88c0d0', '#a3be8c', '#d18d94'] },
  { id: 'solarized', name: 'Solarized', swatch: ['#002b36', '#2f90d4', '#859900', '#e25350'] },
  { id: 'catppuccin', name: 'Catppuccin', swatch: ['#181825', '#89b4fa', '#a6e3a1', '#f38ba8'] },
  { id: 'tokyo-night', name: 'Tokyo Night', swatch: ['#16161e', '#7aa2f7', '#9ece6a', '#f7768e'] },
  { id: 'ayu', name: 'Ayu', swatch: ['#0b0e14', '#e6b450', '#70bf56', '#d95757'] },
  { id: 'night-owl', name: 'Night Owl', swatch: ['#010e1a', '#82aaff', '#22da6e', '#ef5350'] },
  { id: 'gruvbox', name: 'Gruvbox', swatch: ['#1d2021', '#83a598', '#b8bb26', '#fb4934'] },
  { id: 'high-contrast', name: 'High contrast', swatch: ['#000000', '#66ccff', '#5df07f', '#ff6b6b'] },
];
