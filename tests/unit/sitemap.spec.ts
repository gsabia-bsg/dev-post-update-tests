/**
 * Test del lettore di sitemap. Il caso che conta è l'ultimo: se il sitemap si
 * svuota, il run deve fallire e non passare verde per non aver testato niente.
 */
import { test, expect } from '@playwright/test';
import { parseSitemapUrls, toPaths, mergeWithCore, checkMinimum } from '../lib/sitemap';

const BASE = 'https://dev.bsg.it';

test('estrae le URL racchiuse in CDATA, come le scrive AIOSEO', () => {
  const xml = `<urlset>
    <url><loc><![CDATA[http://dev.bsg.it/about-us/]]></loc></url>
    <url><loc><![CDATA[http://dev.bsg.it/services/]]></loc></url>
  </urlset>`;
  expect(parseSitemapUrls(xml)).toEqual([
    'http://dev.bsg.it/about-us/',
    'http://dev.bsg.it/services/',
  ]);
});

test('estrae anche le URL senza CDATA', () => {
  const xml = '<urlset><url><loc>https://dev.bsg.it/blog/</loc></url></urlset>';
  expect(parseSitemapUrls(xml)).toEqual(['https://dev.bsg.it/blog/']);
});

test('ignora le immagini dichiarate in image:loc', () => {
  const xml = `<urlset><url>
    <loc><![CDATA[http://dev.bsg.it/partner/]]></loc>
    <image:image><image:loc><![CDATA[http://dev.bsg.it/wp-content/uploads/x.png]]></image:loc></image:image>
  </url></urlset>`;
  expect(parseSitemapUrls(xml)).toEqual(['http://dev.bsg.it/partner/']);
});

test('ignora date e priorità, che AIOSEO mette anch esse in CDATA', () => {
  const xml = `<urlset><url>
    <loc><![CDATA[http://dev.bsg.it/lsa/]]></loc>
    <lastmod><![CDATA[2026-07-14T15:02:15+00:00]]></lastmod>
    <changefreq><![CDATA[weekly]]></changefreq>
    <priority><![CDATA[0.7]]></priority>
  </url></urlset>`;
  expect(parseSitemapUrls(xml)).toEqual(['http://dev.bsg.it/lsa/']);
});

test('converte in percorsi, tollerando http nel sitemap e https nel baseUrl', () => {
  const urls = ['http://dev.bsg.it/about-us/', 'http://dev.bsg.it/'];
  expect(toPaths(urls, BASE, [])).toEqual(['/', '/about-us/']);
});

test('scarta le URL di altri domini', () => {
  const urls = ['http://dev.bsg.it/blog/', 'https://www.bsg.it/blog/'];
  expect(toPaths(urls, BASE, [])).toEqual(['/blog/']);
});

test('applica i pattern di esclusione', () => {
  const urls = [
    'http://dev.bsg.it/contact-us/',
    'http://dev.bsg.it/metform-form/contatti/',
    'http://dev.bsg.it/wp-content/uploads/x.png',
  ];
  expect(toPaths(urls, BASE, ['/metform-form/', '/wp-content/'])).toEqual(['/contact-us/']);
});

test('rimuove i duplicati e ordina', () => {
  const urls = ['http://dev.bsg.it/b/', 'http://dev.bsg.it/a/', 'http://dev.bsg.it/b/'];
  expect(toPaths(urls, BASE, [])).toEqual(['/a/', '/b/']);
});

test('il nucleo obbligatorio viene per primo, così i guasti importanti si vedono subito', () => {
  const risultato = mergeWithCore(['/a/', '/blog/', '/contact-us/'], ['/', '/contact-us/']);
  expect(risultato).toEqual(['/', '/contact-us/', '/a/', '/blog/']);
});

test('il nucleo obbligatorio è incluso anche se il sitemap non lo dichiara', () => {
  expect(mergeWithCore([], ['/', '/contact-us/'])).toEqual(['/', '/contact-us/']);
});

test('un sitemap troppo povero fa fallire il run invece di passare a vuoto', () => {
  expect(() => checkMinimum(3, 20)).toThrow(/3.*20/);
  expect(() => checkMinimum(28, 20)).not.toThrow();
});
