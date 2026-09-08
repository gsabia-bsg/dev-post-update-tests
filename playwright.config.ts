/** Configurazione Playwright: il primo file letto da `npm test`. */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',

  // Un test alla volta: Wordfence su dev.bsg.it fa rate limiting.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,

  // Un solo ritentativo, e solo in CI: distingue l'instabilità di rete dalla
  // rottura vera. In locale zero, così vedi subito la verità.
  retries: process.env.CI ? 1 : 0,

  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : [['list']],

  use: {
    baseURL: 'https://dev.bsg.it',

    // Il certificato di dev è self-signed e non copre il nome del sito: senza
    // questo i test non aprirebbero nessuna pagina. Si toglie con Let's Encrypt.
    ignoreHTTPSErrors: true,

    // Registrazione completa (DOM, rete, screenshot), solo se già fallito una volta.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',

    // Riconoscibile, per poterlo mettere in allowlist su Wordfence.
    userAgent: 'BSG-PostUpdate-Tests (Playwright)',

    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // Logica pura: nessun browser, nessuna rete.
    { name: 'unit', testMatch: /tests[\\/]unit[\\/].*\.spec\.ts/ },
    // Test che aprono un browser.
    {
      name: 'site',
      testMatch: /tests[\\/]site[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
