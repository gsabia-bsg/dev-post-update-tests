/**
 * Test del validatore di targets.json. Ogni caso corrisponde a un errore che
 * qualcuno potrebbe fare modificando il file. L'ultimo controlla il
 * targets.json reale del repo: è la rete contro il refuso.
 */
import { test, expect } from '@playwright/test';
import { validateTargets, loadTargets, targetFor, acceptedErrorsFor } from '../lib/targets';

const valido = {
  baseUrl: 'https://dev.bsg.it',
  minPages: 20,
  sitemaps: ['/page-sitemap.xml'],
  excludePatterns: ['/wp-content/'],
  core: ['/', '/contact-us/'],
  defaultExpect: ['.main-header', 'footer'],
  defaultCriticalImages: 0,
  acceptedConsoleErrors: [{ match: 'qualcosa', reason: 'perché sì' }],
  overrides: [],
};

test('accetta una configurazione valida', () => {
  const t = validateTargets(valido);
  expect(t.core).toEqual(['/', '/contact-us/']);
  expect(t.minPages).toBe(20);
});

test('rifiuta un baseUrl in http, che falserebbe i test', () => {
  expect(() => validateTargets({ ...valido, baseUrl: 'http://dev.bsg.it' })).toThrow(/https/i);
});

test('rifiuta un minPages non intero o nullo', () => {
  expect(() => validateTargets({ ...valido, minPages: 0 })).toThrow(/minPages/);
  expect(() => validateTargets({ ...valido, minPages: 1.5 })).toThrow(/minPages/);
});

test('rifiuta una lista di sitemap vuota', () => {
  expect(() => validateTargets({ ...valido, sitemaps: [] })).toThrow(/sitemaps/);
});

test('rifiuta un nucleo obbligatorio vuoto: senza di esso un sitemap rotto lascia la suite cieca', () => {
  expect(() => validateTargets({ ...valido, core: [] })).toThrow(/core/);
});

test('rifiuta percorsi che non iniziano con slash', () => {
  expect(() => validateTargets({ ...valido, core: ['contact-us'] })).toThrow(/slash/i);
  expect(() => validateTargets({ ...valido, sitemaps: ['page-sitemap.xml'] })).toThrow(/slash/i);
});

test('rifiuta un errore accettato senza motivazione, per non nascondere regressioni', () => {
  expect(() => validateTargets({ ...valido, acceptedConsoleErrors: [{ match: 'x', reason: '' }] }))
    .toThrow(/reason/i);
});

test('rifiuta una deroga alla soglia di overflow senza motivazione', () => {
  expect(() => validateTargets({
    ...valido,
    overrides: [{ path: '/x/', overflowTolerancePx: 200 }],
  })).toThrow(/notes/i);
});

test('rifiuta deroghe duplicate sullo stesso percorso', () => {
  expect(() => validateTargets({
    ...valido,
    overrides: [{ path: '/x/', criticalImages: 1 }, { path: '/x/', criticalImages: 2 }],
  })).toThrow(/duplicat/i);
});

test('targetFor applica i valori di default a una pagina senza deroghe', () => {
  const t = validateTargets(valido);
  expect(targetFor('/blog/', t)).toEqual({
    path: '/blog/',
    expect: ['.main-header', 'footer'],
    criticalImages: 0,
  });
});

test('targetFor sovrascrive solo i campi dichiarati nella deroga', () => {
  const t = validateTargets({
    ...valido,
    overrides: [{ path: '/x/', criticalImages: 3 }],
  });
  const risultato = targetFor('/x/', t);
  expect(risultato.criticalImages).toBe(3);
  // expect non è dichiarato nella deroga, quindi resta quello di default
  expect(risultato.expect).toEqual(['.main-header', 'footer']);
});

test('le eccezioni di una pagina si aggiungono a quelle globali, senza valere altrove', () => {
  const t = validateTargets({
    ...valido,
    overrides: [{ path: '/x/', acceptedConsoleErrors: [{ match: 'solo qui', reason: 'motivo' }] }],
  });
  expect(acceptedErrorsFor('/x/', t).map((e) => e.match)).toEqual(['qualcosa', 'solo qui']);
  expect(acceptedErrorsFor('/altro/', t).map((e) => e.match)).toEqual(['qualcosa']);
});

test('rifiuta un errore accettato per pagina senza motivazione', () => {
  expect(() => validateTargets({
    ...valido,
    overrides: [{ path: '/x/', acceptedConsoleErrors: [{ match: 'x', reason: '' }] }],
  })).toThrow(/reason/i);
});

test('il targets.json del repo è valido e ha un nucleo che include la homepage', () => {
  const t = loadTargets();
  expect(t.core).toContain('/');
  expect(t.sitemaps.length).toBeGreaterThan(0);
});
