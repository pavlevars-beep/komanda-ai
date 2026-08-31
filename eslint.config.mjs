// @ts-check
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Granice modula se sprovode alatom, ne dogovorom.
 *
 * Smer zavisnosti: app / ui  ->  core  ->  server
 * Suprotan smer je greška u build-u, ne stvar ukusa.
 *
 * Najvažnije pravilo je zabrana uvoza admin (service_role) klijenta baze
 * iz bilo čega što može da završi u browseru.
 */

const NO_SERVICE_ROLE = {
  group: ['@/server/db/admin-client', '**/server/db/admin-client'],
  message:
    'admin-client koristi service_role i zaobilazi RLS. Dozvoljen je samo u migracijama, seed-u i pozadinskim poslovima.',
}

export default tseslint.config(
  {
    // next-env.d.ts generiše Next i ne sme da se menja ručno.
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      'src/server/db/types.generated.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': 'error',
    },
  },

  // --- core: čist domen. Bez React-a, bez Next-a, bez konkretnog klijenta baze. ---
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'core je čist domen — bez React-a.' },
            { name: 'react-dom', message: 'core je čist domen — bez React-a.' },
            { name: 'next', message: 'core je čist domen — bez Next-a.' },
          ],
          patterns: [
            NO_SERVICE_ROLE,
            {
              group: ['next/*', '@/app/*', '@/app/**', '@/ui/*', '@/ui/**'],
              message: 'core ne sme da zna za UI ni za ruting.',
            },
            {
              group: ['@/server/db/user-client'],
              message:
                'Repozitorijumi primaju klijenta baze kao parametar (Db). Tako su testabilni bez Supabase-a.',
            },
          ],
        },
      ],
    },
  },

  // --- ui: prezentacija. Bez pristupa bazi i bez poslovne logike. ---
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/server/*', '@/server/**'],
              message: 'UI komponente ne pristupaju serverskim modulima.',
            },
            {
              group: ['@/core/**/repository', '@/core/**/service'],
              message:
                'UI komponente ne pozivaju domenske servise. Podatke dobijaju kao props.',
            },
          ],
        },
      ],
    },
  },

  // --- app: ruting i kompozicija. Nikad service_role. ---
  {
    files: ['src/app/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [NO_SERVICE_ROLE] }] },
  },

  // Logger je jedino mesto gde je ispis dozvoljen.
  {
    files: ['src/server/logger.ts'],
    rules: { 'no-console': 'off' },
  },

  // Konfiguracioni fajlovi nisu deo tsconfig programa, pa pravila koja traže
  // informacije o tipovima nad njima ne mogu ni da se izvrše. Blok mora da
  // stoji POSLE tipiziranih blokova da bi ih nadjačao.
  {
    files: ['**/*.mjs', '*.config.ts', 'next.config.ts', 'vitest.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Testovi i skripte smeju sve.
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts', '*.config.{ts,mjs}'],
    rules: {
      'no-restricted-imports': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
)
