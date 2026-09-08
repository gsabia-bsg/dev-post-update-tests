/**
 * IL TEST PRINCIPALE. È quello che dice se un aggiornamento ha rotto il sito.
 *
 * Non contiene un test per pagina scritto a mano: legge `targets.json` e
 * genera un test per ogni pagina elencata là. Per controllare una pagina in
 * più non si tocca questo file, si aggiunge una riga di JSON.
 *
 * Su ogni pagina verifica cinque cose, in questo ordine:
 *   1. il server risponde 200
 *   2. le invarianti strutturali (header, footer, CSS applicato, immagini...)
 *   3. nessun errore JavaScript nuovo in console
 *   4. nessuna risorsa del sito che non si carica
 */
import { test, expect } from '../fixtures/clean-page';
import { loadTargets } from '../lib/targets';
import { attachCollectors } from '../lib/collectors';
import { unexpectedConsoleErrors } from '../lib/console-filter';
import { checkPageHealth } from '../lib/page-health';

// Questo gira UNA volta sola, quando Playwright raccoglie i test — prima che
// qualunque test parta. Se targets.json è malformato, il run si ferma subito
// con un errore chiaro invece di fallire pagina per pagina.
const targets = loadTargets();

// Il dominio del sito, ricavato da baseUrl. Serve a distinguere gli errori
// "nostri" da quelli di Google, del chat widget e delle altre terze parti.
const host = new URL(targets.baseUrl).host;

// Un ciclo che crea un test per ciascuna pagina. Nel report li vedrai come
// "smoke /", "smoke /about-us/", e così via: se una pagina si rompe, sai quale.
for (const target of targets.pages) {
  test(`smoke ${target.path}`, async ({ cleanPage }) => {
    // PRIMA della navigazione: attacca gli ascoltatori. Gli errori in console e
    // le richieste fallite avvengono DURANTE il caricamento, quindi chi ascolta
    // deve essere già in posizione. Attaccarli dopo il goto non intercetta
    // nulla.
    const raccolto = attachCollectors(cleanPage, host);

    // Apre la pagina e attende l'evento `load`, cioè che anche le immagini e i
    // fogli di stile siano arrivati (non solo l'HTML).
    const response = await cleanPage.goto(target.path, { waitUntil: 'load' });

    // 1. La pagina esiste e il server non è in errore. `response.status()` è lo
    //    status finale: se c'è stato un redirect 301, qui vediamo il 200 della
    //    destinazione.
    expect(response, `nessuna risposta per ${target.path}`).not.toBeNull();
    expect(response!.status(), `status finale di ${target.path}`).toBe(200);

    // 2. Le invarianti strutturali. `checkPageHealth` non lancia: restituisce la
    //    lista dei problemi trovati, così un test fallito te li mostra TUTTI in
    //    una volta invece di fermarsi al primo.
    const findings = await checkPageHealth(cleanPage, target);
    expect(findings, `invarianti strutturali su ${target.path}`).toEqual([]);

    // 3. Errori JavaScript. Filtrati due volte: si scartano quelli di terze
    //    parti e quelli dichiarati come noti in targets.json. Resta solo ciò che
    //    è nuovo e nostro, cioè una possibile regressione.
    const consoleInattesi = unexpectedConsoleErrors(
      raccolto.consoleErrors,
      targets.acceptedConsoleErrors,
      host,
    );
    expect(consoleInattesi, `errori console nuovi su ${target.path}`).toEqual([]);

    // 4. Risorse del sito che non si sono caricate: un CSS in 404, un'immagine
    //    spostata, uno script che non risponde. Solo del nostro dominio.
    expect(raccolto.failedRequests, `richieste di primo dominio fallite su ${target.path}`).toEqual([]);
  });
}
