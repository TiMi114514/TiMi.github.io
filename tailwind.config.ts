import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#f7f2ea',
        paper: '#fffdf9',
        ink: '#16150f',
        muted: '#6f6a5f',
        line: '#e6dfd2',
        soft: '#efe8db',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'PingFang SC', 'Hiragino Sans', 'Microsoft YaHei', 'Noto Sans CJK SC', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'Times New Roman', 'Songti SC', 'Noto Serif CJK SC', 'SimSun', 'serif'],
      },
      boxShadow: {
        card: '0 1px 0 rgba(22,21,15,0.03), 0 18px 40px -32px rgba(22,21,15,0.45)',
        float: '0 30px 60px -30px rgba(22,21,15,0.35)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
