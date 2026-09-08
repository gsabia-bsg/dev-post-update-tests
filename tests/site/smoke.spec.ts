/**
 * Il test principale: un test per ogni pagina dichiarata dal sitemap di dev.
 * L'elenco non è scritto a mano — si legge dal sito a ogni esecuzione, così una
 * pagina pubblicata entra nei controlli da sola e una rimossa si fa notare.
 */
import { test, expect } from '../fixtures/clean-page';
import { loadTargets, targetFor, acceptedErrorsFor } from '../lib/targets';
import { fetchPagePaths } from '../lib/sitemap';
import { attachCollectors } from '../lib/collectors';
import { unexpectedConsoleErrors } from '../lib/console-filter';
import { checkPageHealth } from '../lib/page-health';

const targets = loadTargets();
const host = new URL(targets.baseUrl).host;

// Attesa in cima al modulo: Playwright importa questo file per raccogliere i
// test, quindi l'elenco è pronto prima che il primo test parta. Se il sitemap è
// rotto o troppo povero il run si ferma qui, invece di passare verde senza aver
// controllato niente.
const percorsi = await fetchPagePaths({
  baseUrl: targets.baseUrl,
  sitemaps: targets.sitemaps,
  excludePatterns: targets.excludePatterns,
  core: targets.core,
  minPages: targets.minPages,
});

for (const percorso of percorsi) {
  const target = targetFor(percorso, targets);

  test(`smoke ${percorso}`, async ({ cleanPage }) => {
    // Prima della navigazione: errori e richieste fallite sono eventi che
    // accadono durante il caricamento, dopo è troppo tardi per intercettarli.
    const raccolto = attachCollectors(cleanPage, host);

    const response = await cleanPage.goto(percorso, { waitUntil: 'load' });

    // Status finale: se c'è stato un redirect, qui vediamo il 200 di arrivo.
    expect(response, `nessuna risposta per ${percorso}`).not.toBeNull();
    expect(response!.status(), `status finale di ${percorso}`).toBe(200);

    // Restituisce la lista dei problemi, non si ferma al primo.
    const findings = await checkPageHealth(cleanPage, target);
    expect(findings, `invarianti strutturali su ${percorso}`).toEqual([]);

    // Resta solo ciò che è nuovo e del nostro dominio. Le eccezioni valide qui
    // sono quelle globali più quelle dichiarate per questa singola pagina.
    const consoleInattesi = unexpectedConsoleErrors(
      raccolto.consoleErrors,
      acceptedErrorsFor(percorso, targets),
      host,
    );
    expect(consoleInattesi, `errori console nuovi su ${percorso}`).toEqual([]);

    // CSS, immagini o script del sito che non si sono caricati.
    expect(raccolto.failedRequests, `richieste di primo dominio fallite su ${percorso}`).toEqual([]);
  });
}
