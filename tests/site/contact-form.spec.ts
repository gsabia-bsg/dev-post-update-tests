/**
 * Il form di contatto. Si rompe in modo silenzioso — continua a mostrarsi ma
 * l'invio non arriva più — e le cose che possono romperlo aggiornandosi sono
 * MetForm, Elementor ed Elementor Pro.
 *
 * Non c'è un test che invia davvero. Ci abbiamo provato il 09/09/2026, anche
 * con le chiavi reCAPTCHA di test di Google: il click di un browser pilotato
 * viene accettato solo ~3 volte su 5, in modo imprevedibile, e ritentarlo
 * peggiora le cose perché reCAPTCHA si blocca. Scrivere il token direttamente
 * nei campi non funziona: MetForm lo legge da `grecaptcha.getResponse()` e
 * blocca l'invio lato client. Le chiavi di test rendono sempre valida la
 * verifica lato server, non rendono il widget meno sospettoso dell'automazione.
 *
 * Un test instabile è peggio di nessun test, quindi si asserisce solo ciò che
 * è deterministico — e che copre comunque i guasti realistici.
 */
import { test, expect } from '../fixtures/clean-page';

const PERCORSO = '/contact-us/';

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

// Il consenso GDPR è obbligatorio: senza la spunta il server rifiuta. L'input
// vero ha display:none e sta dentro un <label>, quindi è l'etichetta che deve
// essere cliccabile — se una regressione la nascondesse, nessun visitatore
// potrebbe più inviare il form.
test('il consenso GDPR è spuntabile da un utente', async ({ cleanPage }) => {
  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });
  const form = cleanPage.locator('.metform-form-content');

  // Click spostato a sinistra di proposito: al centro dell'etichetta c'è il
  // link alla privacy policy, e ci finiremmo sopra navigando via.
  await form
    .locator('label:has(input[name="mf-gdpr-consent"])')
    .click({ position: { x: 6, y: 11 } });

  await expect(form.locator(CAMPI.consenso)).toBeChecked();
});

// Questo è il test che vale di più dei tre, ed è emerso dalla diagnosi: non
// basta che l'iframe di Google esista. Se il widget resta bloccato nello stato
// di caricamento, il form si vede normalmente ma il server rifiuta ogni invio
// perché il token non c'è — e il visitatore non capisce perché.
// Verificato che a widget non disturbato l'inizializzazione va a buon fine
// sistematicamente (11 caricamenti su 11), quindi questa asserzione è stabile.
test('il widget reCAPTCHA si carica e diventa utilizzabile', async ({ cleanPage }) => {
  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });

  const casella = cleanPage
    .frameLocator('.metform-form-content iframe[src*="api2/anchor"]')
    .locator('#recaptcha-anchor');

  await expect(casella).toBeVisible({ timeout: 30_000 });
  await expect(casella, 'il widget resta bloccato in caricamento').not.toHaveClass(
    /recaptcha-checkbox-loading/,
    { timeout: 30_000 },
  );
});
