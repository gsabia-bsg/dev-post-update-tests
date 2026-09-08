/**
 * GLI ASCOLTATORI: raccolgono ciò che accade DURANTE il caricamento.
 *
 * La differenza fra questo file e `page-health.ts` è il momento. Le invarianti
 * si controllano DOPO, interrogando la pagina già caricata. Ma un errore
 * JavaScript o un'immagine in 404 sono eventi che accadono MENTRE la pagina si
 * carica: se non c'è nessuno in ascolto in quell'istante, non ne resta traccia.
 *
 * Per questo `attachCollectors` va chiamata prima del `goto`, e restituisce due
 * liste che si riempiono da sole man mano che gli eventi arrivano. Il test le
 * legge quando il caricamento è finito.
 */
import type { Page } from '@playwright/test';
import type { ConsoleRecord } from './console-filter';
import { isFirstParty } from './console-filter';

export type FailedRequest = { url: string; reason: string };
export type Collected = { consoleErrors: ConsoleRecord[]; failedRequests: FailedRequest[] };

/**
 * Attacca gli ascoltatori a una pagina. Va chiamata PRIMA della navigazione,
 * altrimenti gli eventi del caricamento iniziale vanno persi.
 *
 * Le richieste fallite sono limitate al primo dominio: è ciò che rende
 * superflua una baseline anche per loro, perché il rumore di terze parti
 * (tracker, pixel, script bloccati) non entra.
 */
export function attachCollectors(page: Page, firstPartyHost: string): Collected {
  const raccolto: Collected = { consoleErrors: [], failedRequests: [] };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    raccolto.consoleErrors.push({ text: msg.text(), url: msg.location()?.url });
  });

  page.on('pageerror', (err) => {
    raccolto.consoleErrors.push({ text: `pageerror: ${err.message}`, url: undefined });
  });

  page.on('requestfailed', (req) => {
    if (!isFirstParty(req.url(), firstPartyHost)) return;
    const motivo = req.failure()?.errorText ?? 'sconosciuto';
    // ERR_ABORTED è una cancellazione decisa dalla pagina, non un caricamento
    // fallito: MetForm annulla di suo la fetch di metform/v1/forms/views/<id>
    // su ogni pagina che contiene un form, e il form funziona comunque
    // (verificato l'08/09/2026). Un guasto vero si presenta come 4xx/5xx o
    // come altro codice net::, che restano intercettati.
    if (motivo.includes('ERR_ABORTED')) return;
    raccolto.failedRequests.push({ url: req.url(), reason: motivo });
  });

  page.on('response', (res) => {
    if (res.status() < 400) return;
    if (!isFirstParty(res.url(), firstPartyHost)) return;
    // la navigazione principale è già coperta dall'asserzione sullo status
    if (res.request().resourceType() === 'document') return;
    raccolto.failedRequests.push({ url: res.url(), reason: `HTTP ${res.status()}` });
  });

  return raccolto;
}
