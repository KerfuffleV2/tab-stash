module.exports = {
  root: true,
  parserOptions: {
   parser: '@typescript-eslint/parser',
   tsconfigRootDir: __dirname,
   project: ['./tsconfig.json'],
   extraFileExtensions: ['.vue'],
  },
  plugins: [
    '@typescript-eslint', 'vue',
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    'plugin:vue/vue3-essential',
  ],
  globals: {
    'require': 'readonly',
  },
  rules: {
    // Includes
    '@typescript-eslint/strict-boolean-expressions': 'warn',

    // Excludes
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',

    '@typescript-eslint/restrict-template-expressions': 'off',
    '@typescript-eslint/no-explicit-any': 'off',

    '@typescript-eslint/no-var-requires': 'off',

    'prefer-const': 'off',   
  }
}
