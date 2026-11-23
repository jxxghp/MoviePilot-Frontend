/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    // 桥接全局语义令牌与同心圆角尺度，保留 Tailwind 内置色板与默认圆角类名兼容既有组件
    extend: {
      colors: {
        background: 'var(--mp-bg)',
        foreground: 'var(--mp-fg)',
        surface: 'var(--mp-surface)',
        card: {
          DEFAULT: 'var(--mp-card)',
          foreground: 'var(--mp-fg)',
        },
        muted: {
          DEFAULT: 'var(--mp-muted)',
          foreground: 'var(--mp-muted-fg)',
        },
        faint: 'var(--mp-faint)',
        popover: {
          DEFAULT: 'var(--mp-popover)',
          foreground: 'var(--mp-fg)',
        },
        border: 'var(--mp-border)',
        'border-subtle': 'var(--mp-border-subtle)',
        input: 'var(--mp-input)',
        ring: 'var(--mp-ring)',
        'on-media': 'var(--mp-on-media)',
        'on-media-muted': 'var(--mp-on-media-muted)',
      },
      borderRadius: {
        'mp-surface': 'var(--app-theme-surface-radius)',
        'mp-field': 'var(--app-field-radius)',
        'mp-control': 'var(--app-control-radius)',
        'mp-overlay': 'var(--app-overlay-radius)',
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  corePlugins: {
    aspectRatio: false,
  },
  plugins: [
    require('@tailwindcss/aspect-ratio'),
    // ...
  ],
}
