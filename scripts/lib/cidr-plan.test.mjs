/**
 * Girano con `npm run test:scripts`. Le prove che contano sono le ultime due:
 * il ripristino restituisce l'insieme originale, e il calcolo non muta lo stato
 * ricevuto. Sono le proprietà che, se violate, ti chiudono fuori dal sito.
 * Gli IP usati sono blocchi riservati alla documentazione.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCidr, findPortState, planOpen, planRestore } from './cidr-plan.mjs';

const statoTipico = [
  { fromPort: 80, toPort: 80, protocol: 'tcp', cidrs: ['0.0.0.0/0'] },
  { fromPort: 443, toPort: 443, protocol: 'tcp', cidrs: ['203.0.113.10/32', '198.51.100.0/24'] },
];

test('normalizeCidr aggiunge /32 a un IP nudo', () => {
  assert.equal(normalizeCidr('1.2.3.4'), '1.2.3.4/32');
  assert.equal(normalizeCidr('1.2.3.0/24'), '1.2.3.0/24');
});

test('findPortState trova la porta richiesta', () => {
  assert.equal(findPortState(statoTipico, 443).cidrs.length, 2);
  assert.equal(findPortState(statoTipico, 22), null);
});

test('planOpen aggiunge l IP del runner preservando i CIDR esistenti', () => {
  const piano = planOpen(statoTipico, '5.6.7.8', 443);
  assert.deepEqual(piano.cidrs, ['203.0.113.10/32', '198.51.100.0/24', '5.6.7.8/32']);
  assert.equal(piano.fromPort, 443);
  assert.equal(piano.protocol, 'tcp');
});

test('planOpen non duplica un IP gia presente', () => {
  const piano = planOpen(statoTipico, '203.0.113.10', 443);
  assert.deepEqual(piano.cidrs, ['203.0.113.10/32', '198.51.100.0/24']);
});

test('planOpen su una porta chiusa apre solo per il runner', () => {
  const piano = planOpen(statoTipico, '5.6.7.8', 8443);
  assert.deepEqual(piano.cidrs, ['5.6.7.8/32']);
});

test('planRestore restituisce esattamente l insieme originale', () => {
  const piano = planRestore(statoTipico, 443);
  assert.deepEqual(piano.cidrs, ['203.0.113.10/32', '198.51.100.0/24']);
});

test('planRestore restituisce null se la porta era chiusa', () => {
  assert.equal(planRestore(statoTipico, 8443), null);
});

test('planOpen non muta lo stato ricevuto', () => {
  const copia = JSON.parse(JSON.stringify(statoTipico));
  planOpen(statoTipico, '5.6.7.8', 443);
  assert.deepEqual(statoTipico, copia);
});
