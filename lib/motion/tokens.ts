/** INSIGNAR landing tokens. Mirrors insignar-design/tokens.css; the CSS variables are scoped to `.ins`. */
export const tokens = {
  color: {
    canvas: '#efeeea',
    ink: '#121211',
    muted: '#65625c',
    line: '#d4d2cb',
    panel: '#e6e4de',
    dark: '#141413',
    /** Big blocks and graphics ONLY. White text on it fails contrast. */
    vermBlock: '#f2491c',
    /** Text, labels, buttons. */
    vermInk: '#c8350f',
  },
  radius: { button: 3, panel: 12 },
  ease: { out: 'expo.out', soft: 'power3.out', inOut: 'power2.inOut' },
  dur: { micro: 0.25, reveal: 0.6, scene: 1.0 },
} as const;
