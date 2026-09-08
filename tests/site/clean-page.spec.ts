/**
 * Verifica che la fixture funzioni sul sito vero. Il secondo test è il più
 * utile: se un overlay coprisse il pulsante di invio, andrebbe in timeout.
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
