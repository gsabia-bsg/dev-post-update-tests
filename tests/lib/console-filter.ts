/**
 * FILTRO DEGLI ERRORI JAVASCRIPT.
 *
 * Un errore in console è spesso il primo sintomo di un conflitto fra plugin
 * dopo un aggiornamento. Ma non si può pretendere "zero errori": dev.bsg.it ne
 * produce già uno a riposo (MetForm chiama due volte il rendering del
 * reCAPTCHA), e le terze parti — Google Site Kit, reCAPTCHA, il chat widget —
 * ne generano altri che non dipendono da noi.
 *
 * Una suite che sta rossa per motivi che nessuno può risolvere viene ignorata
 * entro una settimana, e allora non serve a niente. Quindi qui si filtra due
 * volte: si scartano gli errori che NON vengono dal nostro dominio, e quelli
 * dichiarati come noti in targets.json. Resta solo ciò che è nuovo e nostro.
 *
 * Sono funzioni pure — nessun browser, nessuna rete — quindi si possono provare
 * con test istantanei anche a sito spento.
 */
import type { AcceptedConsoleError } from './targets';

export type ConsoleRecord = { text: string; url?: string };

export function isFirstParty(url: string | undefined, host: string): boolean {
  if (!url) return true;
  try {
    return new URL(url).host === host;
  } catch {
    // un url non parsabile è trattato come primo dominio: meglio un falso
    // positivo da indagare che una regressione persa
    return true;
  }
}

export function unexpectedConsoleErrors(
  records: ConsoleRecord[],
  accepted: AcceptedConsoleError[],
  firstPartyHost: string,
): ConsoleRecord[] {
  return records.filter((r) => {
    if (!isFirstParty(r.url, firstPartyHost)) return false;
    return !accepted.some((a) => r.text.includes(a.match));
  });
}
