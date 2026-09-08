import type { Page } from '@playwright/test';
import type { PageTarget } from './targets';

export type Finding = { kind: string; detail: string };

const MARCATORI_FATAL = [
  'There has been a critical error',
  'Si è verificato un errore critico',
  'Fatal error:',
  'Parse error:',
];

export async function checkNoFatalError(page: Page): Promise<Finding[]> {
  const testo = await page.evaluate(() => document.body?.innerText ?? '');
  const trovato = MARCATORI_FATAL.find((m) => testo.includes(m));
  return trovato ? [{ kind: 'fatal-error', detail: `la pagina contiene "${trovato}"` }] : [];
}

export async function checkStylesheetsLoaded(page: Page): Promise<Finding[]> {
  const conRegole = await page.evaluate(() =>
    Array.from(document.styleSheets).some((s) => {
      try {
        return s.cssRules.length > 0;
      } catch {
        // foglio cross-origin: l'accesso alle regole lancia, ma il foglio è caricato
        return true;
      }
    }),
  );
  return conRegole ? [] : [{ kind: 'no-stylesheets', detail: 'nessun foglio di stile con regole' }];
}

export async function checkNoHorizontalOverflow(page: Page): Promise<Finding[]> {
  const { scroll, viewport } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  // 2px di tolleranza per gli arrotondamenti subpixel
  return scroll > viewport + 2
    ? [{ kind: 'horizontal-overflow', detail: `scrollWidth ${scroll} > viewport ${viewport}` }]
    : [];
}

export async function checkImagesDecoded(page: Page, minimum: number): Promise<Finding[]> {
  if (minimum <= 0) return [];
  const decodificate = await page.evaluate(
    () => Array.from(document.images).filter((i) => i.naturalWidth > 0).length,
  );
  return decodificate < minimum
    ? [
        {
          kind: 'images-not-decoded',
          detail: `immagini decodificate ${decodificate}, attese almeno ${minimum}`,
        },
      ]
    : [];
}

export async function checkSelectorsPresent(page: Page, selectors: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const sel of selectors) {
    if ((await page.locator(sel).count()) === 0) {
      findings.push({ kind: 'missing-selector', detail: `selettore assente: ${sel}` });
    }
  }
  return findings;
}

export async function checkTitleNotEmpty(page: Page): Promise<Finding[]> {
  const titolo = (await page.title()).trim();
  return titolo === '' ? [{ kind: 'title-empty', detail: 'title vuoto' }] : [];
}

export async function checkPageHealth(page: Page, target: PageTarget): Promise<Finding[]> {
  return [
    ...(await checkNoFatalError(page)),
    ...(await checkStylesheetsLoaded(page)),
    ...(await checkNoHorizontalOverflow(page)),
    ...(await checkImagesDecoded(page, target.criticalImages)),
    ...(await checkSelectorsPresent(page, target.expect)),
    ...(await checkTitleNotEmpty(page)),
  ];
}
