import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  /*
   * Automatski JSX, isti kao u Next-u.
   *
   * Bez ovoga svaka komponenta u testu puca na „React is not defined", jer
   * esbuild podrazumevano očekuje stari oblik sa `React.createElement`.
   */
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Marker paket koji nema smisla van Next bundle-a.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    /*
     * CSS moduli vraćaju SVOJE nazive klasa, ne prazan objekat.
     *
     * Bez ovoga `styles.nesto` u testu bude `undefined`, pa iscrtana
     * komponenta nema nijednu klasu — a onda alat za gledanje pokazuje
     * neoblikovan raspored i ćutke tvrdi da je sve u redu.
     */
    css: { modules: { classNameStrategy: 'non-scoped' } },
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
})
