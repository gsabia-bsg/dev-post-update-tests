/**
 * LA PAGINA PULITA: la preparazione che ogni test riceve gratis.
 *
 * Su dev.bsg.it ci sono tre cose che si sovrappongono al contenuto: il banner
 * cookie, un popup di Hustle e il widget di chat. Per un visitatore sono normali;
 * per un test automatico sono il problema numero uno — intercettano i click,
 * coprono i pulsanti, e fanno fallire i test per motivi che non hanno niente a
 * che vedere con gli aggiornamenti. Su un sito così, sono una causa di
 * instabilità più frequente del reCAPTCHA.
 *
 * Questo file definisce una "fixture", cioè un pezzo di preparazione che
 * Playwright esegue automaticamente prima di ogni test che la richiede. I test
 * chiedono `cleanPage` invece di `page` e ottengono una pagina in cui i tre
 * overlay sono già neutralizzati.
 *
 * Importante: la neutralizzazione avviene PRIMA che la pagina si carichi, non
 * dopo. Altrimenti il banner farebbe in tempo a comparire e a intercettare il
 * primo click.
 *
 * I test del sito importano `test` ed `expect` da qui, non da `@playwright/test`.
 */
import { test as base, type Page } from '@playwright/test';

// display:none e non visibility:hidden di proposito: un popup che resta nel
// flusso può causare overflow orizzontale e far fallire checkNoHorizontalOverflow
// per un motivo che non è una regressione.
const CSS_SOPPRESSIONE =
  [
    '#cookie-notice',
    '#ai-chat-widget-root',
    '[class*="hustle-modal"]',
    '[class*="hustle-slidein"]',
    '[class*="hustle-popup"]',
  ].join(',') + '{display:none !important}';

export const test = base.extend<{ cleanPage: Page }>({
  cleanPage: async ({ page, context, baseURL }, use) => {
    // il plugin cookie-notice legge questo cookie e non mostra il banner
    await context.addCookies([{ name: 'cookie_notice_accepted', value: 'true', url: baseURL! }]);

    await page.addInitScript((css: string) => {
      const applica = () => {
        const style = document.createElement('style');
        style.id = 'bsg-test-overlay-suppression';
        style.textContent = css;
        (document.head ?? document.documentElement).appendChild(style);
      };
      if (document.head) applica();
      else document.addEventListener('DOMContentLoaded', applica, { once: true });
    }, CSS_SOPPRESSIONE);

    await use(page);
  },
});

export { expect } from '@playwright/test';
