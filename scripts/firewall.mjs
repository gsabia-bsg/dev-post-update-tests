#!/usr/bin/env node
/**
 * Apre la porta 443 dell'istanza Lightsail all'IP del runner e la ripristina.
 * È il guscio di I/O attorno a `lib/cidr-plan.mjs`: qui ci sono solo le chiamate
 * all'AWS CLI, il calcolo delle regole sta là ed è coperto da test.
 *
 * Usa `open-instance-public-ports` e mai `put-instance-public-ports`:
 * quest'ultima chiude tutte le porte non elencate nella richiesta e
 * cancellerebbe l'allowlist dell'ufficio. Il ruolo IAM non la concede nemmeno.
 *
 *   node scripts/firewall.mjs open    --instance NOME --region REGIONE --ip IP --state-file PATH
 *   node scripts/firewall.mjs restore --instance NOME --region REGIONE --state-file PATH
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { planOpen, planRestore } from './lib/cidr-plan.mjs';

const PORTA = 443;

function arg(nome, obbligatorio = true) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1 || !process.argv[i + 1]) {
    if (obbligatorio) throw new Error(`argomento mancante: --${nome}`);
    return undefined;
  }
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

function scriviPorta(instance, region, portInfo) {
  const spec = [
    `fromPort=${portInfo.fromPort}`,
    `toPort=${portInfo.toPort}`,
    `protocol=${portInfo.protocol}`,
    `cidrs=${portInfo.cidrs.join(',')}`,
  ].join(',');
  aws([
    'lightsail', 'open-instance-public-ports',
    '--instance-name', instance,
    '--region', region,
    '--port-info', spec,
    '--output', 'json',
  ]);
}

function chiudiPorta(instance, region, port) {
  aws([
    'lightsail', 'close-instance-public-ports',
    '--instance-name', instance,
    '--region', region,
    '--port-info', `fromPort=${port},toPort=${port},protocol=tcp`,
    '--output', 'json',
  ]);
}

const USO =
  'uso: firewall.mjs open|restore --instance NOME --region REGIONE [--ip IP] --state-file PATH';

const comando = process.argv[2];

// Il comando si riconosce prima di leggere gli argomenti, altrimenti
// un'invocazione senza parametri morirebbe con un'eccezione invece di
// spiegare come si usa.
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
  // Lo stato di partenza va salvato PRIMA di toccare qualsiasi cosa: è l'unica
  // copia che il passo di ripristino avrà a disposizione.
  writeFileSync(stateFile, JSON.stringify(originale, null, 2));
  const piano = planOpen(originale, ip, PORTA);
  scriviPorta(instance, region, piano);
  console.log(`443 aperta a ${piano.cidrs.length} CIDR (aggiunto ${ip}); stato originale in ${stateFile}`);
} else if (comando === 'restore') {
  // Se il file di stato non c'è, l'apertura non è avvenuta: la porta non è mai
  // stata toccata e non c'è niente da ripristinare. Fallire qui aggiungerebbe
  // solo un secondo errore sopra quello vero, mascherandolo.
  if (!existsSync(stateFile)) {
    console.log(`nessuno stato da ripristinare: ${stateFile} non esiste, la porta non è stata aperta`);
    process.exit(0);
  }

  const originale = JSON.parse(readFileSync(stateFile, 'utf8'));
  const piano = planRestore(originale, PORTA);
  if (piano === null) {
    chiudiPorta(instance, region, PORTA);
    console.log('443 era chiusa in origine: richiusa');
  } else {
    scriviPorta(instance, region, piano);
    console.log(`443 ripristinata ai ${piano.cidrs.length} CIDR originali: ${piano.cidrs.join(', ')}`);
  }
}
