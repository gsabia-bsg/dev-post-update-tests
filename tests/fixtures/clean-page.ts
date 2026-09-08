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
