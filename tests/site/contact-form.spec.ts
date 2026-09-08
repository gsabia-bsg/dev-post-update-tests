/**
 * IL FORM DI CONTATTO. È l'unico flusso "scriptato" della suite: gli altri test
 * guardano le pagine, questo compila e invia.
 *
 * Perché conta: un form si rompe in modo silenzioso. Continua a mostrarsi
 * normalmente, ma l'invio non arriva più — e nessuno se ne accorge finché un
 * cliente non si lamenta di non aver ricevuto risposta.
 *
 * Il form di dev.bsg.it è un widget MetForm dentro Elementor, quindi le cose
 * che possono romperlo aggiornandosi sono tre: MetForm, Elementor, Elementor Pro.
 *
 * Tre test in ordine di severità. I primi due funzionano sempre; il terzo, che
 * invia davvero, è disattivato finché su dev non ci sono le chiavi reCAPTCHA di
 * test (vedi in fondo).
 */
import { test, expect } from '../fixtures/clean-page';

const PERCORSO = '/contact-us/';

// Identificativo univoco scritto nel messaggio inviato. Serve a riconoscere le
// submission generate dai test se un giorno apri MetForm > Entries e ti chiedi
// da dove arrivano. In CI vale l'id del run di GitHub, in locale un timestamp.
const RUN_ID = process.env.RUN_ID ?? `local-${Date.now()}`;

// Interruttore del terzo test. Vale true solo se la variabile d'ambiente dice
// esplicitamente che su dev sono configurate le chiavi reCAPTCHA di test.
const INVIO_ABILITATO = process.env.RECAPTCHA_TEST_KEYS === 'true';

/**
 * I selettori dei campi. Usiamo SOLO gli attributi `name`, mai gli `id`:
 * MetForm genera gli id con un suffisso casuale (`mf-input-text-184663a1`) che
 * cambia ogni volta che il form viene risalvato. Ancorarsi a quelli farebbe
 * fallire la suite al primo ritocco del form, senza nessuna regressione vera.
 */
const CAMPI = {
  nome: 'input[name="mf-first-name"]',
  email: 'input[name="mf-email"]',
  oggetto: 'input[name="mf-subject"]',
  messaggio: 'textarea[name="mf-textarea"]',
  consenso: 'input[name="mf-gdpr-consent"]',
  invia: '.metform-submit-btn',
};

/**
 * TEST 1 — Il form esiste ed è utilizzabile.
 *
 * MetForm non è HTML statico: è un'app React che si "idrata" nel browser dopo
 * il caricamento. Nel sorgente della pagina i campi non hanno nemmeno gli
 * attributi. Quindi questo test verifica il risultato dopo l'idratazione: se
 * un aggiornamento rompe il montaggio del widget, i campi non compaiono e qui
 * fallisce.
 */
test('il form è idratato e i campi attesi esistono', async ({ cleanPage }) => {
  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });

  const form = cleanPage.locator('.metform-form-content');
  await expect(form).toBeVisible();

  // Un'asserzione per campo, con l'etichetta nel messaggio: se ne manca uno,
  // il report ti dice quale invece di dire genericamente "form rotto".
  for (const [etichetta, selettore] of Object.entries(CAMPI)) {
    await expect(form.locator(selettore), `campo ${etichetta}`).toHaveCount(1);
  }
});

/**
 * TEST 2 — Il reCAPTCHA si è montato.
 *
 * Questo intercetta un guasto insidioso: se il captcha non si carica, il form
 * si vede ma NON è inviabile dai clienti veri, perché il server rifiuta una
 * submission senza token. Il sito sembra a posto e non riceve più contatti.
 *
 * Cerchiamo l'iframe `api2/anchor`, che è la casella "Non sono un robot" della
 * versione 2. Lo cerchiamo dentro `.metform-form-content` di proposito: sulla
 * pagina c'è un secondo reCAPTCHA, quello del popup Hustle, che non ci riguarda.
 */
test('il widget reCAPTCHA v2 è renderizzato dentro il form', async ({ cleanPage }) => {
  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });

  const anchor = cleanPage.locator('.metform-form-content .g-recaptcha iframe[src*="api2/anchor"]');
  await expect(anchor).toHaveCount(1);
});

/**
 * TEST 3 — L'invio viene accettato dal server. Attualmente SKIPPATO.
 *
 * Perché è skippato: con la site key reale di produzione, un browser
 * automatizzato che parte da un IP di datacenter riceve quasi sempre una sfida
 * a immagini, che Playwright non sa risolvere. Serve configurare su dev (e solo
 * su dev) la coppia di chiavi di test che Google pubblica, che passano sempre.
 *
 * Cosa dimostra quando è attivo: la risposta 2xx dell'endpoint REST prova in un
 * colpo che il widget si è idratato, che i campi esistono ancora, che la
 * validazione è passata, che il token captcha è stato verificato dal server, e
 * che l'handler ha accettato la submission.
 *
 * Cosa NON asserisce, di proposito: nulla di ciò che appare a schermo. Oggi su
 * dev non c'è un mailer configurato, quindi il form mostra sempre un errore
 * SMTP e la conferma non arriva mai; e se un domani configurassi un mailer,
 * quel messaggio cambierebbe e la suite diventerebbe rossa per aver funzionato.
 * Asseriamo solo ciò che è vero in entrambi i mondi.
 */
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

  // Il consenso GDPR è obbligatorio: senza la spunta il server rifiuta.
  await form.locator(CAMPI.consenso).check();

  // La casella del captcha vive dentro un iframe di Google, quindi serve
  // `frameLocator` per entrarci. Con le chiavi di test il click passa subito,
  // senza sfida a immagini, e l'attributo aria-checked conferma il successo.
  const casella = cleanPage
    .frameLocator('.metform-form-content iframe[src*="api2/anchor"]')
    .locator('#recaptcha-anchor');
  await casella.click();
  await expect(casella).toHaveAttribute('aria-checked', 'true');

  // Ci si mette in ascolto della chiamata REST PRIMA di cliccare invia:
  // altrimenti la risposta potrebbe arrivare mentre ancora non ascoltiamo.
  const attesaRisposta = cleanPage.waitForResponse(
    (r) => r.url().includes('/metform/v1/entries') && r.request().method() === 'POST',
  );
  await form.locator(CAMPI.invia).click();
  const risposta = await attesaRisposta;

  // 2xx = il server ha accettato. È questa l'unica asserzione che conta.
  expect(risposta.status(), 'status della submission REST').toBeGreaterThanOrEqual(200);
  expect(risposta.status(), 'status della submission REST').toBeLessThan(300);
});
