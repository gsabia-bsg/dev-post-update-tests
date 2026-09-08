/**
 * Il test principale: genera un test per ogni pagina elencata in targets.json.
 * Per controllarne una in più si aggiunge una riga di JSON, non codice.
 */
import { test, expect } from '../fixtures/clean-page';
import { loadTargets } from '../lib/targets';
import { attachCollectors } from '../lib/collectors';
import { unexpectedConsoleErrors } from '../lib/console-filter';
import { checkPageHealth } from '../lib/page-health';

// Letto una volta sola, prima che i test partano: se targets.json è malformato
// il run si ferma subito invece di fallire pagina per pagina.
const targets = loadTargets();
const host = new URL(targets.baseUrl).host;

for (const target of targets.pages) {
  test(`smoke ${target.path}`, async ({ cleanPage }) => {
    // Prima della navigazione: errori e richieste fallite sono eventi che
    // accadono durante il caricamento, dopo è troppo tardi per intercettarli.
    const raccolto = attachCollectors(cleanPage, host);

    const response = await cleanPage.goto(target.path, { waitUntil: 'load' });

    // Status finale: se c'è stato un redirect, qui vediamo il 200 di arrivo.
    expect(response, `nessuna risposta per ${target.path}`).not.toBeNull();
    expect(response!.status(), `status finale di ${target.path}`).toBe(200);

    // Restituisce la lista dei problemi, non si ferma al primo.
    const findings = await checkPageHealth(cleanPage, target);
    expect(findings, `invarianti strutturali su ${target.path}`).toEqual([]);

    // Resta solo ciò che è nuovo e del nostro dominio.
    const consoleInattesi = unexpectedConsoleErrors(
      raccolto.consoleErrors,
      targets.acceptedConsoleErrors,
      host,
    );
    expect(consoleInattesi, `errori console nuovi su ${target.path}`).toEqual([]);

    // CSS, immagini o script del sito che non si sono caricati.
    expect(raccolto.failedRequests, `richieste di primo dominio fallite su ${target.path}`).toEqual([]);
  });
}
