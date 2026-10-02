// Shared animation constants and class generators.
// Keep everything CSS-driven (no runtime JS animation) unless absolutely
// necessary — compositor-only properties, reduced-motion safe.

export const DURATION = {
  fast: 150,
  normal: 250,
  slow: 350,
} as const;

export const EASE = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

/** CSS class names used by components for consistent motion */
export const classes = {
  fadeInUp: 'animFadeInUp',
  pressScale: 'animPressScale',
  slideUp: 'animSlideUp',
} as const;

/** Helper to build a stagger delay string for inline styles */
export function staggerDelay(index: number, baseMs = 50): string {
  return `${index * baseMs}ms`;
}
