import js from '@eslint/js';
import parser from '@typescript-eslint/parser';
import ts from '@typescript-eslint/eslint-plugin';
export default [
 {ignores:['**/dist/**','**/build/**','**/node_modules/**','**/coverage/**','**/android/**','**/ios/**','scripts/integrate-*.mjs','scripts/fix-*.mjs']},
 {files:['**/*.ts','**/*.tsx'],languageOptions:{parser,parserOptions:{ecmaVersion:'latest',sourceType:'module'},globals:{console:'readonly',process:'readonly',Buffer:'readonly',fetch:'readonly',setTimeout:'readonly',clearTimeout:'readonly',AbortController:'readonly',URL:'readonly',Response:'readonly',Request:'readonly'}},
  plugins:{'@typescript-eslint':ts},rules:{...js.configs.recommended.rules,...ts.configs.recommended.rules,
   'no-undef':'off','no-console':['error',{allow:['warn','error']}],eqeqeq:['error','smart'],'prefer-const':'error','no-var':'error',
   '@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_',caughtErrorsIgnorePattern:'^_'}]}},
 {files:['**/*.test.ts','tests/**/*.ts'],rules:{'no-console':'off'}},
];
