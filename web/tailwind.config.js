/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
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
      },
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
      },
      animation: {
        'roll-up': 'roll-up 0.3s ease-in-out',
        'roll-down': 'roll-down 0.3s ease-in-out',
        // Override Tailwind's default spin with GPU-accelerated version
        'spin': 'spin 1s linear infinite',
        'spin-slow': 'spin-slow 20s linear infinite',
        'spin-slower': 'spin-slower 30s linear infinite',
      },
    },
  },
  plugins: [],
}
