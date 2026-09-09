#!/usr/bin/env node
/**
 * Apre la porta 443 dell'istanza Lightsail all'IP del runner e la richiude.
 * È il guscio di I/O attorno a `lib/cidr-plan.mjs`: qui ci sono solo le chiamate
 * all'AWS CLI, il calcolo delle regole sta là ed è coperto da test.
 *
 * SEMANTICA DELLE API, verificata sul campo il 09/09/2026 dopo esserci
 * sbagliati: `open-instance-public-ports` **aggiunge** i CIDR indicati alla
 * lista esistente, non la sostituisce. Il primo ripristino riscriveva la lista
 * originale credendo di sovrascrivere, e non toglieva nulla: l'IP del runner è
 * rimasto consentito sulla 443. Per rimuovere serve
 * `close-instance-public-ports`.
 *
 * Da qui la regola di questo script: **non si crede a un comando, si rilegge
 * lo stato e si verifica.** Il ripristino confronta il risultato con lo stato
 * di partenza e fallisce rumorosamente se non combacia, invece di dichiarare
 * un successo che non c'è stato.
 *
 *   node scripts/firewall.mjs open    --instance NOME --region REGIONE --ip IP --state-file PATH
 *   node scripts/firewall.mjs restore --instance NOME --region REGIONE --state-file PATH
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { planOpen, planRestore, findPortState, normalizeCidr } from './lib/cidr-plan.mjs';

const PORTA = 443;
const USO =
  'uso: firewall.mjs open|restore --instance NOME --region REGIONE [--ip IP] --state-file PATH';

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1 || !process.argv[i + 1]) throw new Error(`argomento mancante: --${nome}`);
  return process.argv[i + 1];
}

function aws(args) {
  const out = execFileSync('aws', args, { encoding: 'utf8' });
  return out.trim() ? JSON.parse(out) : null;
}

function leggiStato(instance, region) {
  const res = aws([
    'lightsail', 'get-instance-port-states',
    '--instance-name', instance,
    '--region', region,
    '--output', 'json',
  ]);
  return res?.portStates ?? [];
}

/** Aggiunge CIDR alla porta. Non rimuove niente: l'API è additiva. */
function apriPorta(instance, region, portInfo) {
  // JSON invece della sintassi abbreviata `chiave=valore`: con due liste da
  // passare, cidrs e ipv6Cidrs, quella forma diventa ambigua da interpretare.
  aws([
    'lightsail', 'open-instance-public-ports',
    '--instance-name', instance,
    '--region', region,
    '--port-info', JSON.stringify({
      fromPort: portInfo.fromPort,
      toPort: portInfo.toPort,
      protocol: portInfo.protocol,
      cidrs: portInfo.cidrs,
      ipv6Cidrs: portInfo.ipv6Cidrs ?? [],
    }),
    '--output', 'json',
  ]);
}

/** Rimuove i CIDR indicati dalla porta. È l'unico modo di togliere qualcosa. */
function chiudiCidr(instance, region, port, cidrs) {
  aws([
    'lightsail', 'close-instance-public-ports',
    '--instance-name', instance,
    '--region', region,
    '--port-info', JSON.stringify({ fromPort: port, toPort: port, protocol: 'tcp', cidrs }),
    '--output', 'json',
  ]);
}

const comando = process.argv[2];

if (comando !== 'open' && comando !== 'restore') {
  console.error(USO);
  process.exit(2);
}

let instance;
let region;
let stateFile;
let ip;
try {
  instance = arg('instance');
  region = arg('region');
  stateFile = arg('state-file');
  if (comando === 'open') ip = arg('ip');
} catch (e) {
  console.error(`errore: ${e.message}`);
  console.error(USO);
  process.exit(2);
}

// Da qui in avanti gli errori NON vengono catturati: un fallimento dell'AWS CLI
// deve arrivare al log del workflow con tutto il suo messaggio.

if (comando === 'open') {
  const originale = leggiStato(instance, region);
  const cidrRunner = normalizeCidr(ip);

  // Nel file di stato va anche il CIDR aggiunto: il ripristino deve chiudere
  // esattamente quello, e senza saperlo non potrebbe.
  writeFileSync(
    stateFile,
    JSON.stringify({ portStates: originale, cidrRunner }, null, 2),
  );

  apriPorta(instance, region, planOpen(originale, ip, PORTA));
  console.log(`${PORTA} aperta anche a ${cidrRunner}`);
} else {
  // Se il file di stato non c'è, l'apertura non è avvenuta: la porta non è mai
  // stata toccata e non c'è niente da ripristinare. Fallire qui aggiungerebbe
  // solo un secondo errore sopra quello vero, mascherandolo.
  if (!existsSync(stateFile)) {
    console.log(`nessuno stato da ripristinare: ${stateFile} non esiste, la porta non è stata aperta`);
    process.exit(0);
  }

  const salvato = JSON.parse(readFileSync(stateFile, 'utf8'));
  const cidrRunner = salvato.cidrRunner;
  const atteso = planRestore(salvato.portStates, PORTA);

  if (!cidrRunner) {
    console.error('il file di stato non dice quale CIDR era stato aggiunto: impossibile chiudere in modo mirato');
    process.exit(1);
  }

  chiudiCidr(instance, region, PORTA, [cidrRunner]);

  // Verifica, invece di fidarsi. Due cose possono essere andate storte: il CIDR
  // del runner è ancora là, oppure la chiusura ha portato via anche i CIDR
  // legittimi — e in quel caso ci si è chiusi fuori dal proprio sito.
  const dopo = findPortState(leggiStato(instance, region), PORTA);
  const presentiDopo = dopo?.cidrs ?? [];
  const mancanti = (atteso?.cidrs ?? []).filter((c) => !presentiDopo.includes(c));

  if (mancanti.length > 0) {
    // Open è additiva, quindi può rimettere ciò che è stato tolto per sbaglio.
    console.log(`la chiusura ha rimosso anche ${mancanti.join(', ')}: li rimetto`);
    apriPorta(instance, region, atteso);
  }

  const finale = findPortState(leggiStato(instance, region), PORTA);
  const cidrFinali = finale?.cidrs ?? [];

  if (cidrFinali.includes(cidrRunner)) {
    console.error(`RIPRISTINO FALLITO: ${cidrRunner} è ancora consentito sulla ${PORTA}.`);
    console.error('Rimuovilo a mano dalla console Lightsail, poi indaga.');
    process.exit(1);
  }

  const ancoraMancanti = (atteso?.cidrs ?? []).filter((c) => !cidrFinali.includes(c));
  if (ancoraMancanti.length > 0) {
    console.error(`RIPRISTINO INCOMPLETO: mancano ${ancoraMancanti.join(', ')} sulla ${PORTA}.`);
    console.error('Rimettili a mano dalla console Lightsail prima di perdere l accesso al sito.');
    process.exit(1);
  }

  console.log(`${PORTA} ripristinata e verificata — IPv4 consentiti: ${cidrFinali.join(', ') || 'nessuno'}`);
}
