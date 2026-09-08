import { test, expect } from '@playwright/test';
import { validateTargets, loadTargets } from '../lib/targets';

const valido = {
  baseUrl: 'https://dev.bsg.it',
  acceptedConsoleErrors: [{ match: 'qualcosa', reason: 'perché sì' }],
  pages: [{ path: '/', expect: ['header'], criticalImages: 1 }],
};

test('accetta una configurazione valida', () => {
  const t = validateTargets(valido);
  expect(t.pages).toHaveLength(1);
  expect(t.baseUrl).toBe('https://dev.bsg.it');
});

test('rifiuta un baseUrl in http, che falserebbe i test', () => {
  expect(() => validateTargets({ ...valido, baseUrl: 'http://dev.bsg.it' }))
    .toThrow(/https/i);
});

test('rifiuta una lista di pagine vuota', () => {
  expect(() => validateTargets({ ...valido, pages: [] })).toThrow(/almeno una pagina/i);
});

test('rifiuta un path che non inizia con slash', () => {
  expect(() => validateTargets({ ...valido, pages: [{ path: 'contact-us', expect: [], criticalImages: 0 }] }))
    .toThrow(/slash/i);
});

test('rifiuta path duplicati', () => {
  expect(() => validateTargets({
    ...valido,
    pages: [
      { path: '/', expect: [], criticalImages: 0 },
      { path: '/', expect: [], criticalImages: 0 },
    ],
  })).toThrow(/duplicat/i);
});

test('rifiuta criticalImages negativo o non intero', () => {
  expect(() => validateTargets({ ...valido, pages: [{ path: '/', expect: [], criticalImages: -1 }] }))
    .toThrow(/criticalImages/);
  expect(() => validateTargets({ ...valido, pages: [{ path: '/', expect: [], criticalImages: 1.5 }] }))
    .toThrow(/criticalImages/);
});

test('rifiuta un errore accettato senza motivazione, per non nascondere regressioni', () => {
  expect(() => validateTargets({ ...valido, acceptedConsoleErrors: [{ match: 'x', reason: '' }] }))
    .toThrow(/reason/i);
});

test('il file targets.json del repo è valido e contiene la pagina contatti', () => {
  const t = loadTargets();
  expect(t.pages.map((p) => p.path)).toContain('/contact-us/');
});
