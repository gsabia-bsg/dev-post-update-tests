/**
 * Il form di contatto: l'unico flusso che compila e invia.
 * Si rompe in modo silenzioso — continua a mostrarsi ma l'invio non arriva più.
 * Le cose che possono romperlo aggiornandosi sono MetForm, Elementor ed Elementor Pro.
 */
import { test, expect } from '../fixtures/clean-page';

const PERCORSO = '/contact-us/';

// Finisce nel messaggio inviato, per riconoscere le submission dei test.
const RUN_ID = process.env.RUN_ID ?? `local-${Date.now()}`;

// Il terzo test invia davvero solo se su dev ci sono le chiavi reCAPTCHA di test.
const INVIO_ABILITATO = process.env.RECAPTCHA_TEST_KEYS === 'true';

// Solo attributi `name`: gli `id` di MetForm hanno un suffisso casuale che
// cambia a ogni risalvataggio del form.
const CAMPI = {
  nome: 'input[name="mf-first-name"]',
  email: 'input[name="mf-email"]',
  oggetto: 'input[name="mf-subject"]',
  messaggio: 'textarea[name="mf-textarea"]',
  consenso: 'input[name="mf-gdpr-consent"]',
  invia: '.metform-submit-btn',
};

// MetForm è un'app React: nel sorgente i campi non hanno nemmeno gli attributi.
// Questo verifica il risultato dopo l'idratazione.
test('il form è idratato e i campi attesi esistono', async ({ cleanPage }) => {
  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });

  const form = cleanPage.locator('.metform-form-content');
  await expect(form).toBeVisible();

  for (const [etichetta, selettore] of Object.entries(CAMPI)) {
    await expect(form.locator(selettore), `campo ${etichetta}`).toHaveCount(1);
  }
});

// Se il captcha non si monta, il form si vede ma nessun cliente può inviarlo.
// Cerchiamo dentro .metform-form-content perché sulla pagina c'è anche il
// reCAPTCHA del popup Hustle, che non ci riguarda.
test('il widget reCAPTCHA v2 è renderizzato dentro il form', async ({ cleanPage }) => {
  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });

  const anchor = cleanPage.locator('.metform-form-content .g-recaptcha iframe[src*="api2/anchor"]');
  await expect(anchor).toHaveCount(1);
});

// Una risposta 2xx prova in un colpo: widget idratato, campi presenti,
// validazione passata, token captcha verificato dal server, submission accettata.
// Non si asserisce nulla di ciò che appare a schermo: oggi il form mostra sempre
// un errore SMTP, e quel messaggio cambierebbe configurando un mailer.
test("l'endpoint REST accetta la submission", async ({ cleanPage }) => {
  test.skip(
    !INVIO_ABILITATO,
    'Richiede le chiavi reCAPTCHA di test su dev — spec D9 e questione aperta §12.4',
  );

  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });
  const form = cleanPage.locator('.metform-form-content');

  await form.locator(CAMPI.nome).fill('Test automatico');
  await form.locator(CAMPI.email).fill('qa@bsg.it');
  await form.locator(CAMPI.oggetto).fill(`Test post-aggiornamento ${RUN_ID}`);
  await form
    .locator(CAMPI.messaggio)
    .fill(`Invio automatico della suite post-aggiornamento. RUN_ID=${RUN_ID}. Non rispondere.`);

  // Obbligatorio: senza la spunta il server rifiuta.
  await form.locator(CAMPI.consenso).check();

  // La casella vive in un iframe di Google, serve frameLocator per entrarci.
  const casella = cleanPage
    .frameLocator('.metform-form-content iframe[src*="api2/anchor"]')
    .locator('#recaptcha-anchor');
  await casella.click();
  await expect(casella).toHaveAttribute('aria-checked', 'true');

  // In ascolto prima del click, altrimenti la risposta può arrivare troppo presto.
  const attesaRisposta = cleanPage.waitForResponse(
    (r) => r.url().includes('/metform/v1/entries') && r.request().method() === 'POST',
  );
  await form.locator(CAMPI.invia).click();
  const risposta = await attesaRisposta;

  expect(risposta.status(), 'status della submission REST').toBeGreaterThanOrEqual(200);
  expect(risposta.status(), 'status della submission REST').toBeLessThan(300);
});
