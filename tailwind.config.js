/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Geist', 'DM Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: {
          base: '#0d0d0f',
          surface: '#111114',
          elevated: '#18181d',
          overlay: '#1e1e25',
        },
        border: {
          DEFAULT: '#222229',
          subtle: '#1a1a20',
          strong: '#2e2e38',
        },
        accent: {
          primary: '#5c6cfa',
          secondary: '#8b5cf6',
          glow: 'rgba(92, 108, 250, 0.15)',
          dim: 'rgba(92, 108, 250, 0.08)',
        },
        text: {
          primary: '#e8e8f0',
          secondary: '#8888a0',
          muted: '#555568',
          accent: '#7c8dfc',
        },
        status: {
          error: '#ff4d6a',
          success: '#34d399',
          warning: '#fbbf24',
          errorBg: 'rgba(255, 77, 106, 0.08)',
          successBg: 'rgba(52, 211, 153, 0.08)',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in': 'slideIn 0.25s ease-out',
        'pulse-once': 'pulseOnce 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseOnce: {
          '0%': { backgroundColor: 'rgba(92, 108, 250, 0.25)' },
          '100%': { backgroundColor: 'transparent' },
        }
      }
    },
  },
  plugins: [],
}
