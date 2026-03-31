import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sidebar dark
        sidebar: {
          bg: '#071722',
          mid: '#0c2330',
          end: '#102c39',
        },
        // Surface / neutrals
        surface: {
          DEFAULT: '#f8fafc',
          soft: '#f9fbfc',
          card: '#ffffff',
          border: '#e2e8f0',
          panel: '#d9e5e8',
        },
        // Text
        ink: {
          primary: '#0f172a',
          heading: '#111827',
          secondary: '#334155',
          body: '#475569',
          label: '#64748b',
          meta: '#94a3b8',
        },
        // Teal — live / active / positive
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          400: '#5eead4',
          500: '#14b8a6',
          700: '#0f766e',
          900: '#115e59',
        },
        // Blue — ready / informational
        blue: {
          50: '#eff6ff',
          100: '#dbeafe',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#0369a1',
        },
        // Amber — warning / pending
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          300: '#fcd34d',
          400: '#f59e0b',
          500: '#d97706',
          600: '#b45309',
          800: '#92400e',
        },
        // Orange — blocked / escalation
        orange: {
          50: '#ffedd5',
          400: '#fb923c',
          500: '#f97316',
          600: '#c2410c',
          900: '#7c2d12',
        },
        // Red — critical / destructive
        red: {
          500: '#ef4444',
          700: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        pill: '999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(15,23,42,0.07), 0 4px 12px rgba(15,23,42,0.04)',
        'card-hover': '0 4px 16px rgba(15,23,42,0.10), 0 1px 4px rgba(15,23,42,0.06)',
        panel: '0 2px 8px rgba(15,23,42,0.06)',
      },
    },
  },
  plugins: [],
};
export default config;
