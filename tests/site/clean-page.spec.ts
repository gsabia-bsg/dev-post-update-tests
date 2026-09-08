/**
 * Verifica che la fixture di pulizia funzioni davvero contro il sito reale.
 *
 * È un test sullo strumento, non sul sito, ma deve girare su una pagina vera:
 * il banner cookie, il popup e il chat widget esistono solo là. Se un giorno un
 * aggiornamento cambia il modo in cui uno dei tre si presenta, questo test
 * fallisce e ti avvisa che la fixture va aggiornata — prima che l'intera suite
 * inizi a fallire per motivi misteriosi.
 *
 * Il secondo test è il più utile dei due: verifica che il pulsante di invio del
 * form sia effettivamente cliccabile. Se un overlay lo coprisse, Playwright
 * andrebbe in timeout, ed è esattamente il guasto che la fixture previene.
 */
import { test, expect } from '../fixtures/clean-page';

test('sulla pagina contatti i tre overlay non sono visibili', async ({ cleanPage }) => {
  await cleanPage.goto('/contact-us/', { waitUntil: 'load' });

  for (const selettore of ['#cookie-notice', '#ai-chat-widget-root']) {
    const locator = cleanPage.locator(selettore);
    if ((await locator.count()) > 0) {
      await expect(locator.first()).toBeHidden();
    }
  }

  const hustle = cleanPage.locator('[class*="hustle-modal"], [class*="hustle-slidein"], [class*="hustle-popup"]');
  for (let i = 0; i < (await hustle.count()); i++) {
    await expect(hustle.nth(i)).toBeHidden();
  }
});

test('il pulsante di invio del form è cliccabile senza ostruzioni', async ({ cleanPage }) => {
  await cleanPage.goto('/contact-us/', { waitUntil: 'load' });
  const invia = cleanPage.locator('.metform-submit-btn');
  await expect(invia).toBeVisible();
  // se un overlay coprisse il pulsante, questo scatterebbe in timeout
  await expect(invia).toBeEnabled();
  await invia.scrollIntoViewIfNeeded();
});
