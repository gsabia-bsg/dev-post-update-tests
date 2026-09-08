/**
 * IL CALCOLO DELLE REGOLE DI FIREWALL. È la parte più pericolosa del progetto,
 * ed è per questo che sta isolata qui.
 *
 * Il problema: dev.bsg.it accetta connessioni solo da IP autorizzati, e un
 * runner GitHub non è fra quelli. Quindi il workflow deve aprirgli la porta 443
 * per la durata dei test e poi richiuderla.
 *
 * Il rischio: se lo fa male, cancella dalla lista anche l'IP del tuo ufficio e
 * ti chiude fuori dal tuo stesso sito. Per questo la logica è divisa in due.
 * Qui ci sono solo FUNZIONI PURE: ricevono lo stato attuale del firewall come
 * dato, restituiscono la regola da scrivere, e non parlano con AWS. Così si
 * possono provare con test veri, istantanei e senza conseguenze.
 * Le chiamate ad AWS stanno in `scripts/firewall.mjs`, che è un guscio sottile
 * attorno a queste funzioni.
 *
 * Il pattern è "leggi, modifica, ripristina": si legge la lista esistente, si
 * aggiunge l'IP del runner senza toccare gli altri, e a fine test si riscrive
 * ESATTAMENTE la lista che si era letta.
 *
 * Il file è `.mjs` (JavaScript, non TypeScript) perché deve girare direttamente
 * con `node` dentro il workflow, senza passare da una compilazione.
 */
const PORTA_DEFAULT = 443;
const PROTOCOLLO_DEFAULT = 'tcp';

export function normalizeCidr(ipOrCidr) {
  return String(ipOrCidr).includes('/') ? String(ipOrCidr) : `${ipOrCidr}/32`;
}

export function findPortState(portStates, port, protocol = PROTOCOLLO_DEFAULT) {
  const trovato = (portStates ?? []).find(
    (s) => s.fromPort === port && s.toPort === port && s.protocol === protocol,
  );
  return trovato ?? null;
}

/**
 * Calcola la regola da scrivere per aprire la porta al runner, preservando i
 * CIDR gia consentiti. Non muta lo stato ricevuto.
 */
export function planOpen(portStates, runnerIp, port = PORTA_DEFAULT) {
  const stato = findPortState(portStates, port);
  const esistenti = stato ? [...stato.cidrs] : [];
  const nuovo = normalizeCidr(runnerIp);
  const cidrs = esistenti.includes(nuovo) ? esistenti : [...esistenti, nuovo];
  return { fromPort: port, toPort: port, protocol: PROTOCOLLO_DEFAULT, cidrs };
}

/**
 * Calcola la regola da riscrivere per tornare esattamente allo stato iniziale.
 * Restituisce null se la porta era chiusa: in quel caso il chiamante deve
 * richiuderla con close-instance-public-ports, non riscriverla.
 */
export function planRestore(portStates, port = PORTA_DEFAULT) {
  const stato = findPortState(portStates, port);
  if (!stato) return null;
  return {
    fromPort: port,
    toPort: port,
    protocol: PROTOCOLLO_DEFAULT,
    cidrs: [...stato.cidrs],
  };
}
