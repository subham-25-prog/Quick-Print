import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['.next/**','node_modules/**','public/**','next-env.d.ts','playwright-report/**','test-results/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  { languageOptions: { globals: { process:'readonly',Buffer:'readonly',console:'readonly',fetch:'readonly',URL:'readonly',Request:'readonly',Response:'readonly',setTimeout:'readonly',clearTimeout:'readonly',setInterval:'readonly',clearInterval:'readonly',window:'readonly',document:'readonly',localStorage:'readonly',sessionStorage:'readonly',navigator:'readonly',alert:'readonly',confirm:'readonly',File:'readonly',FormData:'readonly',Blob:'readonly',TextEncoder:'readonly',TextDecoder:'readonly',AbortSignal:'readonly',crypto:'readonly',HTMLInputElement:'readonly',HTMLDivElement:'readonly',HTMLElement:'readonly',StorageEvent:'readonly' } }, rules: { '@typescript-eslint/no-explicit-any':'off', '@typescript-eslint/no-unused-vars':'off', 'no-empty':['error',{allowEmptyCatch:true}], 'no-undef':'off', '@typescript-eslint/no-require-imports':'off' } }
);
