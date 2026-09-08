import { test, expect } from '@playwright/test';
import {
  checkNoFatalError,
  checkStylesheetsLoaded,
  checkNoHorizontalOverflow,
  checkImagesDecoded,
  checkSelectorsPresent,
  checkTitleNotEmpty,
  checkPageHealth,
} from '../lib/page-health';

test('checkNoFatalError segnala la pagina di errore critico di WordPress', async ({ page }) => {
  await page.setContent('<title>x</title><body>There has been a critical error on this website.</body>');
  expect(await checkNoFatalError(page)).toHaveLength(1);

  await page.setContent('<title>x</title><body>Si è verificato un errore critico sul tuo sito web.</body>');
  expect(await checkNoFatalError(page)).toHaveLength(1);

  await page.setContent('<title>x</title><body>tutto bene</body>');
  expect(await checkNoFatalError(page)).toEqual([]);
});

test('checkStylesheetsLoaded segnala una pagina senza fogli di stile', async ({ page }) => {
  await page.setContent('<title>x</title><body>niente css</body>');
  expect(await checkStylesheetsLoaded(page)).toHaveLength(1);

  await page.setContent('<title>x</title><style>body{color:red}</style><body>con css</body>');
  expect(await checkStylesheetsLoaded(page)).toEqual([]);
});

test('checkNoHorizontalOverflow segnala il layout che sfonda la viewport', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent('<title>x</title><body style="margin:0"><div style="width:5000px;height:10px"></div></body>');
  expect(await checkNoHorizontalOverflow(page)).toHaveLength(1);

  await page.setContent('<title>x</title><body style="margin:0"><div style="width:100px;height:10px"></div></body>');
  expect(await checkNoHorizontalOverflow(page)).toEqual([]);
});

test('checkImagesDecoded conta solo le immagini realmente decodificate', async ({ page }) => {
  const pngValido =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  await page.setContent(`<title>x</title><body><img src="${pngValido}"></body>`);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  expect(await checkImagesDecoded(page, 1)).toEqual([]);

  await page.setContent('<title>x</title><body><img src="data:image/png;base64,rotto"></body>');
  expect(await checkImagesDecoded(page, 1)).toHaveLength(1);

  await page.setContent('<title>x</title><body>nessuna immagine</body>');
  expect(await checkImagesDecoded(page, 0)).toEqual([]);
});

test('checkSelectorsPresent segnala i selettori mancanti uno per uno', async ({ page }) => {
  await page.setContent('<title>x</title><body><header>h</header></body>');
  expect(await checkSelectorsPresent(page, ['header'])).toEqual([]);
  const findings = await checkSelectorsPresent(page, ['header', 'footer', 'nav']);
  expect(findings).toHaveLength(2);
  expect(findings.map((f) => f.detail).join(' ')).toContain('footer');
});

test('checkTitleNotEmpty segnala un title vuoto', async ({ page }) => {
  await page.setContent('<title></title><body>x</body>');
  expect(await checkTitleNotEmpty(page)).toHaveLength(1);
  await page.setContent('<title>BSG</title><body>x</body>');
  expect(await checkTitleNotEmpty(page)).toEqual([]);
});

test('checkPageHealth aggrega tutti i controlli', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent('<title></title><body style="margin:0"><div style="width:5000px;height:10px"></div></body>');
  const findings = await checkPageHealth(page, { path: '/x', expect: ['footer'], criticalImages: 0 });
  const kinds = findings.map((f) => f.kind).sort();
  expect(kinds).toEqual(['horizontal-overflow', 'missing-selector', 'no-stylesheets', 'title-empty']);
});
