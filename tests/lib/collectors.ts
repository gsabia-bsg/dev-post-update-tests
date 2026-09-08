/**
 * Raccoglie errori e richieste fallite mentre la pagina si carica: sono eventi,
 * se nessuno ascolta in quell'istante non ne resta traccia. Va chiamata prima
 * del `goto`; le due liste si riempiono da sole.
 */
import type { Page } from '@playwright/test';
import type { ConsoleRecord } from './console-filter';
import { isFirstParty } from './console-filter';

export type FailedRequest = { url: string; reason: string };
export type Collected = { consoleErrors: ConsoleRecord[]; failedRequests: FailedRequest[] };

// Le richieste fallite sono limitate al primo dominio, così il rumore di terze
// parti (tracker, pixel, script bloccati) non entra.
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
    // Un abort è una cancellazione della pagina, non un caricamento fallito:
    // MetForm annulla di suo la fetch della vista del form, e il form funziona.
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
