module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ['@antfu/eslint-config-vue', 'plugin:sonarjs/recommended'],
  ignorePatterns: ['src/@iconify/*.js', 'node_modules', 'dist', '*.d.ts'],
  plugins: ['regex'],
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',

    'sonarjs/no-duplicate-string': 'warn',

    'vue/valid-v-slot': ['error', {
      allowModifiers: true,
    }],

    // https://github.com/gmullerb/eslint-plugin-regex
    'regex/invalid': [
      'error',
      [
        {
          regex: '@/assets/images',
          replacement: '@images',
          message: 'Use \'@images\' path alias for image imports',
        },
        {
          regex: '@/styles',
          replacement: '@styles',
          message: 'Use \'@styles\' path alias for importing styles from \'src/styles\'',
        },

        // {
        //   id: 'Disallow icon of icon library',
        //   regex: 'tabler-\\w',
        //   message: 'Only \'mdi\' icons are allowed',
        // },

        {
          regex: '@core/\\w',
          message: 'You can\'t use @core when you are in @layouts module',
          files: {
            inspect: '@layouts/.*',
          },
        },
        {
          regex: 'useLayouts\\(',
          message:
            '`useLayouts` composable is only allowed in @layouts & @core directory. Please use `useThemeConfig` composable instead.',
          files: {
            inspect: '^(?!.*(@core|@layouts)).*',
          },
        },
      ],

      // Ignore files
      '.eslintrc.js',
    ],
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.ts', '.js', '.tsx', '.jsx', '.mjs', '.png', '.jpg'],
      },
      typescript: {},
    },
  },
}
