import containerQueries from '@tailwindcss/container-queries'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./.storybook/**/*.{ts,tsx}",
  ],
  darkMode: 'class',
  // Safelist dynamic severity color classes built at runtime via template strings
  // (e.g. bg-${color}-500/10, border-${color}-500/50, text-${color}-400)
  safelist: [
    { pattern: /^bg-(red|orange|blue|green|yellow|purple)-500\/\d+$/ },
    { pattern: /^border-(red|orange|blue|green|yellow|purple)-500\/\d+$/ },
    { pattern: /^text-(red|orange|blue|green|yellow|purple)-400$/ },
    { pattern: /^bg-(red|orange|blue|green|yellow|purple)-500\/\d+$/, variants: ['hover'] },
    { pattern: /^border-(red|orange|blue|green|yellow|purple)-500\/\d+$/, variants: ['hover'] },
    { pattern: /^text-(red|orange|blue|green|yellow|purple)-400$/, variants: ['hover'] },
  ],
  theme: {
    extend: {
      /**
       * Container query breakpoint tokens for card-width-responsive layouts.
       * Cards use @container queries instead of viewport breakpoints so they
       * respond to their own width (which shrinks when panels expand).
       *
       * @xs  (<300px)  — stack vertically, hide non-essential controls
       * @sm  (300px+)  — two-row wrapped layout
       * @md  (450px+)  — relaxed wrapping
       * @lg  (600px+)  — single-row layout (full width)
       */
      containers: {
        xs: '300px',
        sm: '300px',
        md: '450px',
        lg: '600px',
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        /**
         * Semantic status colors — use for health indicators, alerts, badges.
         * Defined as CSS variables in index.css so themes can override them.
         * Usage: text-status-success, bg-status-error, border-status-warning
         * Note: opacity modifiers (e.g., /20) are not supported with var() values.
         */
        /** LinkedIn brand blue (#0A66C2) — used for LinkedIn share buttons */
        linkedin: {
          DEFAULT: '#0A66C2',
          dark: '#004182',
        },
        /** Near-black backgrounds for terminal/console UIs */
        terminal: '#0d0d0d',
        'near-black': '#0a0a0a',
        status: {
          success: "var(--color-success)",
          warning: "var(--color-warning)",
          error: "var(--color-error)",
          info: "var(--color-info)",
          neutral: "var(--color-neutral)",
          pending: "var(--color-pending)",
        },
        linkedin: {
          DEFAULT: '#0A66C2',
          dark: '#004182',
        },
        terminal: '#0d0d0d',
        'glass-overlay': 'rgba(10,15,25,0.98)',
      },
      /**
       * Z-Index Scale — semantic layers for global stacking.
       * Use these instead of arbitrary z-[N] values on fixed/sticky elements.
       *
       * z-dropdown (100) — Popovers, dropdowns, tooltips, floating panels
       * z-sidebar  (150) — Docked sidebars (desktop mission sidebar, left nav)
       * z-sticky   (200) — Sticky headers, floating action buttons
       * z-floating (250) — Portaled floating menus that must sit above sticky headers
       *                    but below non-modal overlays (e.g. agent selector dropdown)
       * z-overlay  (300) — Non-modal backdrops (mobile sidebar, notification dimmer)
       * z-modal    (400) — All modals and dialogs (mobile mission sheet, MissionBrowser)
       * z-toast    (500) — Toast notifications (always on top of modals)
       * z-critical (600) — Confirmation dialogs stacked on top of modals
       *
       * Local stacking (z-10, z-20) within a positioned parent is fine as-is.
       */
      zIndex: {
        dropdown: '100',
        sidebar: '150',
        sticky: '200',
        floating: '250',
        overlay: '300',
        modal: '400',
        toast: '500',
        critical: '600',
      },
      /**
       * Border-Radius Convention:
       * - rounded-full  — Pills, avatars, circular indicators only
       * - rounded-xl    — Modals, large panels, marketing page cards
       * - rounded-lg    — Dashboard cards, buttons, inputs (the default)
       * - rounded-md    — Small inline elements, badges
       * - rounded-sm    — Tiny legend swatches, heatmap cells (≤16px elements)
       */
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        'roll-up': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '50%': { transform: 'translateY(-100%)', opacity: '0' },
          '51%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'roll-down': {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '50%': { transform: 'translateY(100%)', opacity: '0' },
          '51%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        // GPU-accelerated spin animations using translate3d to force compositing
        'spin': {
          from: { transform: 'rotate(0deg) translateZ(0)' },
          to: { transform: 'rotate(360deg) translateZ(0)' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg) translateZ(0)' },
          to: { transform: 'rotate(360deg) translateZ(0)' },
        },
        'spin-slower': {
          from: { transform: 'rotate(360deg) translateZ(0)' },
          to: { transform: 'rotate(0deg) translateZ(0)' },
        },
        'pulse-once': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'roll-up': 'roll-up 0.3s ease-in-out',
        'roll-down': 'roll-down 0.3s ease-in-out',
        // Override Tailwind's default spin with GPU-accelerated version
        'spin': 'spin 1s linear infinite',
        'spin-slow': 'spin-slow 20s linear infinite',
        'spin-slower': 'spin-slower 30s linear infinite',
        'pulse-once': 'pulse-once 1s ease-in-out 3',
      },
    },
  },
  plugins: [containerQueries],
}
