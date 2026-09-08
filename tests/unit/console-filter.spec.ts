/**
 * Test del filtro. L'ultimo copre un'incertezza vera: non sappiamo se Chromium
 * attribuisca l'errore del reCAPTCHA a gstatic o a dev.bsg.it — il filtro lo
 * neutralizza in entrambi i casi.
 */
import { test, expect } from '@playwright/test';
import { isFirstParty, unexpectedConsoleErrors } from '../lib/console-filter';
import type { ConsoleRecord } from '../lib/console-filter';

const HOST = 'dev.bsg.it';

test('riconosce il primo dominio', () => {
  expect(isFirstParty('https://dev.bsg.it/wp-content/x.js', HOST)).toBe(true);
  expect(isFirstParty('https://www.gstatic.com/recaptcha/a.js', HOST)).toBe(false);
});

test('un url assente è trattato come primo dominio, per non perdere errori', () => {
  expect(isFirstParty(undefined, HOST)).toBe(true);
  expect(isFirstParty('', HOST)).toBe(true);
});

test('scarta gli errori di terze parti', () => {
  const records: ConsoleRecord[] = [
    { text: 'errore di google', url: 'https://www.gstatic.com/recaptcha/a.js' },
  ];
  expect(unexpectedConsoleErrors(records, [], HOST)).toEqual([]);
});

test('scarta gli errori dichiarati come accettati', () => {
  const records: ConsoleRecord[] = [
    { text: 'Error: reCAPTCHA has already been rendered in this element', url: 'https://dev.bsg.it/x.js' },
  ];
  const accepted = [{ match: 'reCAPTCHA has already been rendered', reason: 'difetto noto di MetForm' }];
  expect(unexpectedConsoleErrors(records, accepted, HOST)).toEqual([]);
});

test('segnala un errore nuovo di primo dominio', () => {
  const records: ConsoleRecord[] = [
    { text: 'TypeError: undefined is not a function', url: 'https://dev.bsg.it/wp-content/plugins/x.js' },
  ];
  const risultato = unexpectedConsoleErrors(records, [], HOST);
  expect(risultato).toHaveLength(1);
  expect(risultato[0].text).toContain('TypeError');
});

test('un errore accettato ma di terze parti non conta due volte', () => {
  const records: ConsoleRecord[] = [
    { text: 'reCAPTCHA has already been rendered in this element', url: 'https://www.gstatic.com/recaptcha/a.js' },
  ];
  const accepted = [{ match: 'reCAPTCHA has already been rendered', reason: 'difetto noto di MetForm' }];
  expect(unexpectedConsoleErrors(records, accepted, HOST)).toEqual([]);
});
