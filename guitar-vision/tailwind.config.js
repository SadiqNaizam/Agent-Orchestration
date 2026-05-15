/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        guitar: {
          wood: '#8B4513',
          fret: '#C0A060',
          string: '#D4AF37',
          neck: '#5C3317',
          body: '#2D1B00',
        },
        chord: {
          root: '#FF6B35',
          major: '#4ECDC4',
          minor: '#45B7D1',
          seventh: '#96CEB4',
          detected: '#00FF88',
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite',
        'strum': 'strum 0.3s ease-out',
        'fret-press': 'fret-press 0.2s ease-in-out',
        'tab-slide': 'tab-slide 0.4s ease-out',
        'wave': 'wave 2s linear infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '80%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        'strum': {
          '0%': { transform: 'translateX(-4px)', opacity: '0.6' },
          '50%': { transform: 'translateX(4px)', opacity: '1' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fret-press': {
          '0%': { transform: 'scale(1)', backgroundColor: 'transparent' },
          '50%': { transform: 'scale(1.3)', backgroundColor: '#FF6B35' },
          '100%': { transform: 'scale(1.1)', backgroundColor: '#FF6B35' },
        },
        'tab-slide': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'wave': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'glow': {
          from: { boxShadow: '0 0 5px #00FF88, 0 0 10px #00FF88' },
          to: { boxShadow: '0 0 20px #00FF88, 0 0 40px #00FF88, 0 0 60px #00FF88' },
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
