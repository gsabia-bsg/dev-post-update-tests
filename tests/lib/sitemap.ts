/**
 * Legge l'elenco delle pagine dal sitemap del sito sotto esame, invece di
 * mantenerlo a mano in targets.json (che era incompleto dal primo giorno).
 *
 * Il sitemap è generato da un plugin, quindi due paracadute sono obbligatori:
 * una soglia minima di pagine sotto la quale il run fallisce, e un nucleo di
 * pagine testate sempre. Senza il primo, un aggiornamento che rompe AIOSEO
 * renderebbe la suite verde per non aver testato niente.
 */
import { request } from '@playwright/test';

/** Estrae le URL da un sitemap XML. AIOSEO le racchiude in CDATA. */
export function parseSitemapUrls(xml: string): string[] {
  // Il tag cercato è esattamente `<loc>`: così `<image:loc>` non viene preso,
  // e nemmeno lastmod, changefreq o priority, che stanno anch'essi in CDATA.
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*(https?:\/\/[^\]\s<]+)/gi;
  const risultato: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) risultato.push(m[1]);
  return risultato;
}

/**
 * Converte le URL in percorsi, tenendo solo quelle del nostro dominio.
 * Il sitemap dichiara URL in http mentre i test girano in https: confrontando
 * solo l'host e conservando il percorso, la differenza di protocollo non conta.
 */
export function toPaths(urls: string[], baseUrl: string, excludePatterns: string[]): string[] {
  const host = new URL(baseUrl).host;
  const percorsi = new Set<string>();
  for (const u of urls) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      continue;
    }
    if (parsed.host !== host) continue;
    if (excludePatterns.some((p) => parsed.pathname.includes(p))) continue;
    percorsi.add(parsed.pathname);
  }
  return [...percorsi].sort();
}

/** Il nucleo obbligatorio viene per primo: i guasti importanti si vedono subito. */
export function mergeWithCore(sitemapPaths: string[], core: string[]): string[] {
  const visti = new Set<string>();
  const risultato: string[] = [];
  for (const p of [...core, ...sitemapPaths]) {
    if (visti.has(p)) continue;
    visti.add(p);
    risultato.push(p);
  }
  return risultato;
}

export function checkMinimum(trovate: number, minPages: number): void {
  if (trovate < minPages) {
    throw new Error(
      `Il sitemap ha restituito solo ${trovate} pagine, meno del minimo atteso di ${minPages}. ` +
        'Probabile guasto del plugin che lo genera: il run si ferma qui invece di ' +
        'passare verde senza aver controllato niente.',
    );
  }
}

/** Unica funzione che tocca la rete: scarica i sitemap e restituisce i percorsi. */
export async function fetchPagePaths(opts: {
  baseUrl: string;
  sitemaps: string[];
  excludePatterns: string[];
  core: string[];
  minPages: number;
}): Promise<string[]> {
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const urls: string[] = [];
    for (const s of opts.sitemaps) {
      const res = await ctx.get(new URL(s, opts.baseUrl).toString());
      if (!res.ok()) throw new Error(`sitemap ${s}: HTTP ${res.status()}`);
      urls.push(...parseSitemapUrls(await res.text()));
    }
    const percorsi = toPaths(urls, opts.baseUrl, opts.excludePatterns);
    checkMinimum(percorsi.length, opts.minPages);
    return mergeWithCore(percorsi, opts.core);
  } finally {
    await ctx.dispose();
  }
}
