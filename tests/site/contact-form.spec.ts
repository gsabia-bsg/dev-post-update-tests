import { test, expect } from '../fixtures/clean-page';

const PERCORSO = '/contact-us/';
const RUN_ID = process.env.RUN_ID ?? `local-${Date.now()}`;
const INVIO_ABILITATO = process.env.RECAPTCHA_TEST_KEYS === 'true';

const CAMPI = {
  nome: 'input[name="mf-first-name"]',
  email: 'input[name="mf-email"]',
  oggetto: 'input[name="mf-subject"]',
  messaggio: 'textarea[name="mf-textarea"]',
  consenso: 'input[name="mf-gdpr-consent"]',
  invia: '.metform-submit-btn',
};

test('il form è idratato e i campi attesi esistono', async ({ cleanPage }) => {
  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });

  const form = cleanPage.locator('.metform-form-content');
  await expect(form).toBeVisible();

  for (const [etichetta, selettore] of Object.entries(CAMPI)) {
    await expect(form.locator(selettore), `campo ${etichetta}`).toHaveCount(1);
  }
});

test('il widget reCAPTCHA v2 è renderizzato dentro il form', async ({ cleanPage }) => {
  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });

  const anchor = cleanPage.locator('.metform-form-content .g-recaptcha iframe[src*="api2/anchor"]');
  await expect(anchor).toHaveCount(1);
});

test("l'endpoint REST accetta la submission", async ({ cleanPage }) => {
  test.skip(
    !INVIO_ABILITATO,
    'Richiede le chiavi reCAPTCHA di test su dev — spec D9 e questione aperta §12.5',
  );

  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });
  const form = cleanPage.locator('.metform-form-content');

  await form.locator(CAMPI.nome).fill('Test automatico');
  await form.locator(CAMPI.email).fill('qa@bsg.it');
  await form.locator(CAMPI.oggetto).fill(`Test post-aggiornamento ${RUN_ID}`);
  await form
    .locator(CAMPI.messaggio)
    .fill(`Invio automatico della suite post-aggiornamento. RUN_ID=${RUN_ID}. Non rispondere.`);
  await form.locator(CAMPI.consenso).check();

  const casella = cleanPage
    .frameLocator('.metform-form-content iframe[src*="api2/anchor"]')
    .locator('#recaptcha-anchor');
  await casella.click();
  await expect(casella).toHaveAttribute('aria-checked', 'true');

  const attesaRisposta = cleanPage.waitForResponse(
    (r) => r.url().includes('/metform/v1/entries') && r.request().method() === 'POST',
  );
  await form.locator(CAMPI.invia).click();
  const risposta = await attesaRisposta;

  expect(risposta.status(), 'status della submission REST').toBeGreaterThanOrEqual(200);
  expect(risposta.status(), 'status della submission REST').toBeLessThan(300);
});
