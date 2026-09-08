/**
 * Configurazione di Playwright: è il primo file che viene letto quando lanci
 * `npm test`. Definisce dove stanno i test, contro quale sito puntano e come si
 * comportano quando falliscono.
 *
 * Le scelte qui dentro non sono preferenze di stile: quasi ognuna risponde a un
 * vincolo di dev.bsg.it, annotato riga per riga.
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Playwright cerca i file di test dentro questa cartella, ricorsivamente.
  testDir: './tests',

  // I test NON girano in parallelo, e c'è un solo processo di lavoro.
  // Motivo: su dev.bsg.it c'è Wordfence, che ha un rate limiting. Una raffica
  // di richieste simultanee da un solo IP rischia di farci bloccare, e un
  // blocco somiglia a una regressione senza esserlo.
  fullyParallel: false,
  workers: 1,

  // Se qualcuno lascia un `test.only` nel codice, in CI il run fallisce invece
  // di eseguire silenziosamente un solo test facendo credere che sia tutto ok.
  forbidOnly: !!process.env.CI,

  // Un solo tentativo in più, e solo in CI. Serve a distinguere il caso
  // instabile (passa al secondo giro: era la rete) dalla rottura vera (fallisce
  // due volte). In locale zero, così vedi subito la verità.
  retries: process.env.CI ? 1 : 0,

  // In CI produce il report HTML navigabile più le annotazioni sulla pagina del
  // run di GitHub. In locale la lista scorrevole, che è più leggibile a schermo.
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : [['list']],

  use: {
    // Tutti i percorsi nei test sono relativi a questo indirizzo: nei test
    // scriviamo `goto('/contact-us/')`, non l'URL completo.
    baseURL: 'https://dev.bsg.it',

    // dev.bsg.it ha un certificato self-signed emesso per l'IP 3.73.112.45, che
    // non copre il nome dev.bsg.it: qualunque browser lo rifiuterebbe. Senza
    // questa riga i test non riuscirebbero nemmeno ad aprire una pagina.
    // Il prezzo è che la suite non si accorge di problemi TLS reali. Si toglie
    // il giorno in cui l'istanza avrà un certificato Let's Encrypt valido.
    ignoreHTTPSErrors: true,

    // La traccia è una registrazione completa del test: DOM, richieste di rete e
    // screenshot per ogni passo. Pesa, quindi la catturiamo solo quando un test
    // ha già fallito una volta ed è stato ritentato.
    trace: 'on-first-retry',

    // Screenshot automatico nel momento del fallimento.
    screenshot: 'only-on-failure',

    // User-Agent riconoscibile: serve a poter mettere in allowlist questo
    // traffico su Wordfence, e a distinguerlo nei log del server dal traffico
    // dei visitatori veri.
    userAgent: 'BSG-PostUpdate-Tests (Playwright)',

    // Quanto attendere una singola azione (un click, un fill) e una
    // navigazione, prima di dichiarare il timeout.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  // Due gruppi di test separati, che si lanciano indipendentemente.
  projects: [
    {
      // Test di logica pura: non aprono nessun browser e non toccano la rete.
      // Sono istantanei, e si possono eseguire anche quando dev.bsg.it è giù.
      name: 'unit',
      testMatch: /tests[\\/]unit[\\/].*\.spec\.ts/,
    },
    {
      // Test che aprono un browser vero. Alcuni interrogano dev.bsg.it, altri
      // solo pagine HTML costruite al volo in memoria.
      name: 'site',
      testMatch: /tests[\\/]site[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
