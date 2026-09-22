import type { Config } from 'tailwindcss';

/**
 * 与参考站一致：Tailwind v3.4。
 * 设计令牌放在 app/globals.css 的 CSS 变量里，这里只把它们映射成工具类。
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        line2: 'rgb(var(--c-line-2) / <alpha-value>)',
        fg: 'rgb(var(--c-fg) / <alpha-value>)',
        dim: 'rgb(var(--c-dim) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
      },
      fontFamily: {
        display: 'var(--font-display)',
        mono: 'var(--font-mono)',
        sans: 'var(--font-sans)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(.16,1,.3,1)',
        'in-out-quint': 'cubic-bezier(.83,0,.17,1)',
      },
    },
  },
  plugins: [],
};

export default config;
