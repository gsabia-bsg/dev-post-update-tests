import { test, expect } from '../fixtures/clean-page';
import { loadTargets } from '../lib/targets';
import { attachCollectors } from '../lib/collectors';
import { unexpectedConsoleErrors } from '../lib/console-filter';
import { checkPageHealth } from '../lib/page-health';

const targets = loadTargets();
const host = new URL(targets.baseUrl).host;

for (const target of targets.pages) {
  test(`smoke ${target.path}`, async ({ cleanPage }) => {
    const raccolto = attachCollectors(cleanPage, host);

    const response = await cleanPage.goto(target.path, { waitUntil: 'load' });
    expect(response, `nessuna risposta per ${target.path}`).not.toBeNull();
    expect(response!.status(), `status finale di ${target.path}`).toBe(200);

    const findings = await checkPageHealth(cleanPage, target);
    expect(findings, `invarianti strutturali su ${target.path}`).toEqual([]);

    const consoleInattesi = unexpectedConsoleErrors(
      raccolto.consoleErrors,
      targets.acceptedConsoleErrors,
      host,
    );
    expect(consoleInattesi, `errori console nuovi su ${target.path}`).toEqual([]);

    expect(raccolto.failedRequests, `richieste di primo dominio fallite su ${target.path}`).toEqual([]);
  });
}
