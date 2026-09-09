# Test post-aggiornamento dev.bsg.it — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una suite Playwright lanciabile a mano da GitHub Actions che, dopo ogni aggiornamento manuale su `dev.bsg.it`, dice in pochi minuti se il sito si è rotto.

**Architecture:** Repo privato con i test su runner GitHub-hosted. Nulla viene installato sull'istanza Lightsail: i test interrogano il sito dall'esterno via HTTPS. L'unica scrittura verso l'infrastruttura è l'apertura temporanea della porta 443 nel firewall Lightsail per l'IP del runner, con pattern read-modify-restore. Le asserzioni sono dichiarative (un file di dati elenca pagine e invarianti) più un solo flusso scriptato sul form di contatto.

**Tech Stack:** Node.js 20, TypeScript (transpilato da Playwright, nessun build step), `@playwright/test`, Node test runner integrato (`node --test`) per la logica pura in `.mjs`, GitHub Actions, AWS CLI v2.

**Spec:** `docs/superpowers/specs/2026-09-08-wp-post-update-testing-design.md`

---

## Global Constraints

Valgono per ogni attività, senza ripeterle.

- **Base URL:** `https://dev.bsg.it` con `ignoreHTTPSErrors: true`. **Mai `http://`** — i font Elementor sono referenziati in `https` assoluto e in HTTP finiscono cross-origin, falsando la pagina (spec D4).
- **`workers: 1`** e User-Agent riconoscibile, per non farsi bloccare dal rate limiting di Wordfence (spec §8).
- **Nessuna credenziale WordPress** in alcun secret, e **nessun accesso a wp-admin** (spec D7).
- **Nessuna installazione né esecuzione di codice sull'istanza Lightsail** (spec D12).
- **Selettori del form:** solo attributi `name`. Gli `id` di MetForm hanno suffissi casuali e cambiano al risalvataggio (spec §2.2).
- **Sul form non si asserisce mai il testo mostrato in pagina**, né la conferma né l'errore (spec D8).
- **IAM:** mai concedere `lightsail:PutInstancePublicPorts` (spec D3).
- **La chiusura del firewall sta in uno step `if: always()`** (spec §8).
- **Repo privato.**
- **Playwright pinnato a versione esatta** in `package.json` (nessun `^`).
- Le **chiavi reCAPTCHA di test** vivono solo su dev, mai in produzione (spec D9).

## Sequenza ed effetto delle questioni aperte

Le attività **1-8** e **12** si sviluppano e si verificano in locale contro `dev.bsg.it`: l'IP dello sviluppatore è già in allowlist sul firewall Lightsail, quindi non serve nulla da AWS. Vanno eseguite per prime.

Le attività **9-11** richiedono le risposte alle questioni aperte §12.1-12.4 della spec (nome istanza, regione, CIDR attuali, ruolo IAM, repo GitHub). Se non sono disponibili, si fermi il lavoro alla 8 e alla 12: la suite è già utilizzabile a mano in locale.

Stato degli strumenti sulla macchina di sviluppo, rilevato l'08/09/2026: Node 24.13.1, npm 11.8.0, git 2.54.0 presenti. **`gh` e `aws` non installati**: il Task 9 richiede l'AWS CLI per la verifica manuale, e il Task 10 può essere lanciato dall'interfaccia web di GitHub in assenza di `gh`.

L'attività **7** ha un ramo condizionale legato alla questione aperta §12.5 (chiavi reCAPTCHA di test): senza di esse il test di invio resta `skip`, documentato, e le prime due asserzioni del form funzionano comunque.

## Deviazione dalla spec, dichiarata

La spec §6 descrive il controllo del CSS come *"CSS realmente applicato (computed style)"*. Il piano lo implementa come **verifica che almeno un foglio di stile risulti caricato e con regole** (`document.styleSheets`), non come confronto di una computed style contro un valore atteso. Ragione: il font di fallback del browser varia fra piattaforme (Chromium su Linux CI e su Windows locale non concordano), e un'asserzione su quello sarebbe instabile — esattamente il tipo di falso positivo che D5 e D6 vogliono evitare. Il controllo scelto intercetta comunque il guasto realistico: foglio in 404 o non accodato.

## Deviazioni emerse eseguendo il piano

Registrate l'08/09/2026, tutte guidate da evidenza raccolta contro il sito reale.

**Il tema non usa il tag `<header>`.** I selettori strutturali che avevo ipotizzato erano sbagliati e facevano fallire tutte e 16 le pagine. Il tema `most` usa `div.main-header`. Verificato su sette pagine che l'insieme universale è `.main-header`, `nav`, `main`, `footer`.

**Soglia di overflow da 2px a 32px, più deroga per pagina.** Il carosello Swiper in homepage produce da solo qualche pixel di scostamento durante l'animazione: misurati 1285 contro 1280, e 1277 in una misura successiva sulla stessa pagina. Una soglia stretta darebbe rosso permanente senza segnalare regressioni. L'invariante mira al layout catastroficamente rotto, non allo sforamento minimo.

In più, `PageTarget` guadagna due campi opzionali non previsti: `overflowTolerancePx` e `notes`, con il validatore che **esige `notes` se c'è una deroga** — la stessa disciplina degli errori console accettati. Serviva perché `/cyber-security/` ha circa 155px di overflow preesistente, che è un difetto vero del sito: dichiararlo con la sua ragione è corretto, silenziarlo alzando la soglia globale non lo sarebbe.

**`ERR_ABORTED` escluso dalle richieste fallite.** L'assunzione del piano — che il solo scoping al primo dominio rendesse superflua una baseline sulle richieste — è stata falsificata: MetForm annulla di suo la fetch di `metform/v1/forms/views/<id>` su ogni pagina con un form, producendo nove falsi positivi. Un abort è una cancellazione decisa dalla pagina, non un caricamento fallito, e il form funziona comunque. I 4xx/5xx e gli altri codici `net::` restano intercettati.

**Il runner di test di Node vuole un glob.** `node --test scripts/lib/` su Node 24 tenta di risolvere la cartella come modulo e fallisce con `MODULE_NOT_FOUND`. Serve `node --test "scripts/**/*.test.mjs"`.

**Playwright 1.63.0** invece di 1.55.0, e `--with-deps` solo in CI: su Windows quel flag non ha effetto.

**Il documento di procedura prodotto dal Task 12 è stato eliminato il 09/09/2026** su richiesta dell'utente, insieme a tutta la documentazione di quel tema. Il testo del compito è stato rimosso da questa cronaca per coerenza.

**Il Task 11 non si realizza.** L'utente ha deciso l'08/09/2026 di rinunciare al workflow notturno di riconciliazione del firewall, giudicando il rischio residuo accettabile rispetto al costo di mantenere una lista di CIDR di riferimento. Il rischio è ora documentato in §8 della spec. Conseguenze applicate: `firewall-allowlist.json` è stato rimosso (era creato dallo Step 5 del Task 8 e non ha più consumatori) e la questione aperta §12.2 della spec è chiusa perché non più necessaria. Il testo del Task 11 resta qui sotto come documentazione di ciò che era stato progettato, non come lavoro da fare. Se un giorno lo si volesse, la variante da preferire è quella che si autocostruisce il riferimento leggendolo dal firewall al primo avvio, senza nulla da trascrivere a mano.

---

### Task 1: Scaffold del repo e configurazione Playwright provata sul sito

Il deliverable è una configurazione Playwright che raggiunge davvero `dev.bsg.it` in HTTPS con certificato non fidato. È la precondizione di tutto il resto, e il test che la prova resta in suite come sentinella.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `playwright.config.ts`
- Create: `README.md`
- Test: `tests/site/reachability.spec.ts`

**Interfaces:**
- Consumes: niente, è la prima attività
- Produces: la config Playwright con `baseURL`, `ignoreHTTPSErrors`, i due project `unit` e `site`, e gli script npm `test:unit`, `test:site`, `test`

- [ ] **Step 1: Inizializza il repo git**

```bash
git init
git branch -M main
```

- [ ] **Step 2: Scrivi il test che deve fallire**

`tests/site/reachability.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('il sito risponde 200 in HTTPS nonostante il certificato self-signed', async ({ page }) => {
  const response = await page.goto('/');
  expect(response, 'nessuna risposta: baseURL o rete non configurate').not.toBeNull();
  expect(response!.status()).toBe(200);
  expect(new URL(page.url()).protocol, 'i test devono girare in HTTPS, mai in HTTP').toBe('https:');
});
```

- [ ] **Step 3: Esegui il test per verificare che fallisca**

Run: `npx playwright test tests/site/reachability.spec.ts`
Expected: FAIL — `playwright.config.ts` e le dipendenze non esistono ancora, il comando non parte.

- [ ] **Step 4: Crea `package.json`**

```json
{
  "name": "bsg-dev-post-update-tests",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test:unit": "playwright test --project=unit --pass-with-no-tests",
    "test:site": "playwright test --project=site",
    "test": "npm run test:unit && npm run test:site"
  },
  "devDependencies": {
    "@playwright/test": "1.63.0",
    "@types/node": "^24.0.0",
    "typescript": "^5.6.0"
  }
}
```

Nota: `@playwright/test` è pinnata a versione esatta senza `^`, come impone il vincolo globale. La 1.63.0 è l'ultima stabile verificata l'08/09/2026.

- [ ] **Step 5: Crea `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["tests/**/*.ts", "playwright.config.ts"]
}
```

- [ ] **Step 6: Crea `.gitignore`**

```
node_modules/
test-results/
playwright-report/
blob-report/
playwright/.cache/
.playwright-mcp/
firewall-state.json
*.local.json
.env
```

`firewall-state.json` è lo stato originale del firewall salvato durante un run: non deve finire in git.

- [ ] **Step 7: Crea `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['list']],
  use: {
    baseURL: 'https://dev.bsg.it',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    userAgent: 'BSG-PostUpdate-Tests (Playwright)',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'unit',
      testMatch: /tests[\\/]unit[\\/].*\.spec\.ts/,
    },
    {
      name: 'site',
      testMatch: /tests[\\/]site[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

`workers: 1` e `fullyParallel: false` sono un vincolo globale, non una preferenza: servono contro il rate limiting di Wordfence.

- [ ] **Step 8: Installa le dipendenze e il browser**

```bash
npm install
npx playwright install chromium
```

In locale su Windows si usa `npx playwright install chromium` **senza** `--with-deps`: quel flag installa pacchetti di sistema e ha effetto solo su Linux. Nel workflow del Task 10, che gira su `ubuntu-latest`, `--with-deps` va invece mantenuto.

- [ ] **Step 9: Esegui il test per verificare che passi**

Run: `npm run test:site -- tests/site/reachability.spec.ts`
Expected: PASS

Se fallisce con un errore di certificato, `ignoreHTTPSErrors` non è stato applicato: si verifichi che il test giri nel project `site`.

- [ ] **Step 10: Scrivi `README.md`**

```markdown
# Test post-aggiornamento — dev.bsg.it

Suite Playwright che verifica `dev.bsg.it` dopo ogni aggiornamento manuale di
WordPress, plugin o tema.

**Spec:** `docs/superpowers/specs/2026-09-08-wp-post-update-testing-design.md`

## Uso in locale

Richiede che il proprio IP sia nell'allowlist del firewall Lightsail.

```bash
npm ci
npx playwright install --with-deps chromium
npm test
```

- `npm run test:unit` — logica pura, nessuna rete
- `npm run test:site` — contro dev.bsg.it

## Variabili d'ambiente

| Variabile | Dove | Effetto |
|---|---|---|
| `RUN_ID` | test del form | Identificativo scritto nel messaggio inviato, per riconoscere le submission di test |
| `RECAPTCHA_TEST_KEYS` | test del form | `true` solo se su dev sono configurate le chiavi reCAPTCHA di test; altrimenti il test di invio resta skippato |

## Contratto sul firewall

`firewall-allowlist.json` è la **fonte di verità** dei CIDR legittimi sulle porte
80 e 443. Il workflow di riconciliazione riporta il firewall a quella lista e
**fallisce** se ha trovato differenze. Se aggiungi legittimamente un IP dalla
console Lightsail, committa la modifica anche qui.
```

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore playwright.config.ts README.md tests/site/reachability.spec.ts
git commit -m "chore: scaffold repo e config Playwright verso dev.bsg.it in HTTPS"
```

---

### Task 2: `targets.json` e loader validato

Le pagine da controllare sono dati, non codice. Il loader valida il file e rifiuta le configurazioni che violerebbero la spec — in particolare un `baseUrl` in `http://` e una voce di errore accettato senza motivazione.

**Files:**
- Create: `targets.json`
- Create: `tests/lib/targets.ts`
- Test: `tests/unit/targets.spec.ts`

**Interfaces:**
- Consumes: la config Playwright del Task 1 (project `unit`)
- Produces:
  - `type AcceptedConsoleError = { match: string; reason: string }`
  - `type PageTarget = { path: string; expect: string[]; criticalImages: number }`
  - `type Targets = { baseUrl: string; acceptedConsoleErrors: AcceptedConsoleError[]; pages: PageTarget[] }`
  - `function validateTargets(raw: unknown): Targets`
  - `function loadTargets(filePath?: string): Targets` — default `targets.json` nella radice del repo

- [ ] **Step 1: Scrivi i test che devono fallire**

`tests/unit/targets.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `npx playwright test --project=unit tests/unit/targets.spec.ts`
Expected: FAIL — `Cannot find module '../lib/targets'`

- [ ] **Step 3: Crea `targets.json`**

Le pagine provengono dai link interni della homepage rilevati l'8 settembre 2026 (spec §5).

```json
{
  "baseUrl": "https://dev.bsg.it",
  "acceptedConsoleErrors": [
    {
      "match": "reCAPTCHA has already been rendered in this element",
      "reason": "MetForm 4.3.0 chiama renderReCaptcha due volte (idratazione e window.onload). Verificato l'08/09/2026 che il widget dei contatti e' comunque renderizzato e funzionante. Rimuovere questa voce quando MetForm sistemera' l'idempotenza."
    }
  ],
  "pages": [
    { "path": "/", "expect": ["header", "nav", "footer"], "criticalImages": 1 },
    { "path": "/about-us/", "expect": ["header", "footer"], "criticalImages": 1 },
    { "path": "/services/", "expect": ["header", "footer"], "criticalImages": 1 },
    { "path": "/it-consulting/", "expect": ["header", "footer"], "criticalImages": 1 },
    { "path": "/cyber-security/", "expect": ["header", "footer"], "criticalImages": 1 },
    { "path": "/managedservices/", "expect": ["header", "footer"], "criticalImages": 1 },
    { "path": "/customservices/", "expect": ["header", "footer"], "criticalImages": 1 },
    { "path": "/it-training/", "expect": ["header", "footer"], "criticalImages": 1 },
    { "path": "/software-development-custom-solution/", "expect": ["header", "footer"], "criticalImages": 1 },
    { "path": "/sostenibilita/", "expect": ["header", "footer"], "criticalImages": 1 },
    { "path": "/partner/", "expect": ["header", "footer"], "criticalImages": 1 },
    { "path": "/carriere/", "expect": ["header", "footer"], "criticalImages": 0 },
    { "path": "/bsg-hub/", "expect": ["header", "footer"], "criticalImages": 0 },
    { "path": "/blog/", "expect": ["header", "footer"], "criticalImages": 1 },
    { "path": "/whistleblower/", "expect": ["header", "footer"], "criticalImages": 0 },
    { "path": "/contact-us/", "expect": ["header", "footer", ".metform-form-content"], "criticalImages": 0 }
  ]
}
```

I selettori `expect` sono volutamente pochi e generici: sono invarianti strutturali, non una descrizione del layout. Al primo run si verifichi che `header`, `nav` e `footer` esistano davvero come tag sul tema `most`; se il tema usa solo `div`, si sostituiscano con selettori di classe stabili e si annoti la ragione qui.

- [ ] **Step 4: Implementa `tests/lib/targets.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export type AcceptedConsoleError = { match: string; reason: string };
export type PageTarget = { path: string; expect: string[]; criticalImages: number };
export type Targets = {
  baseUrl: string;
  acceptedConsoleErrors: AcceptedConsoleError[];
  pages: PageTarget[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateTargets(raw: unknown): Targets {
  if (!isRecord(raw)) throw new Error('targets: la radice deve essere un oggetto');

  const baseUrl = raw.baseUrl;
  if (typeof baseUrl !== 'string' || !baseUrl.startsWith('https://')) {
    throw new Error('targets.baseUrl deve iniziare con https:// — in http i font Elementor vanno in CORS e falsano i test');
  }

  const acceptedRaw = raw.acceptedConsoleErrors ?? [];
  if (!Array.isArray(acceptedRaw)) throw new Error('targets.acceptedConsoleErrors deve essere un array');
  const acceptedConsoleErrors: AcceptedConsoleError[] = acceptedRaw.map((e, i) => {
    if (!isRecord(e)) throw new Error(`acceptedConsoleErrors[${i}] deve essere un oggetto`);
    const match = e.match;
    const reason = e.reason;
    if (typeof match !== 'string' || match.trim() === '') {
      throw new Error(`acceptedConsoleErrors[${i}].match mancante`);
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new Error(`acceptedConsoleErrors[${i}].reason mancante: ogni errore accettato deve dichiarare perché lo è`);
    }
    return { match, reason };
  });

  const pagesRaw = raw.pages;
  if (!Array.isArray(pagesRaw) || pagesRaw.length === 0) {
    throw new Error('targets.pages deve contenere almeno una pagina');
  }
  const pages: PageTarget[] = pagesRaw.map((p, i) => {
    if (!isRecord(p)) throw new Error(`pages[${i}] deve essere un oggetto`);
    const path = p.path;
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new Error(`pages[${i}].path deve iniziare con uno slash`);
    }
    const expectRaw = p.expect ?? [];
    if (!Array.isArray(expectRaw) || expectRaw.some((s) => typeof s !== 'string')) {
      throw new Error(`pages[${i}].expect deve essere un array di stringhe`);
    }
    const criticalImages = p.criticalImages ?? 0;
    if (typeof criticalImages !== 'number' || !Number.isInteger(criticalImages) || criticalImages < 0) {
      throw new Error(`pages[${i}].criticalImages deve essere un intero non negativo`);
    }
    return { path, expect: expectRaw as string[], criticalImages };
  });

  const seen = new Set<string>();
  for (const p of pages) {
    if (seen.has(p.path)) throw new Error(`pages: path duplicato ${p.path}`);
    seen.add(p.path);
  }

  return { baseUrl, acceptedConsoleErrors, pages };
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadTargets(filePath = resolve(repoRoot, 'targets.json')): Targets {
  return validateTargets(JSON.parse(readFileSync(filePath, 'utf8')));
}
```

- [ ] **Step 5: Esegui i test per verificare che passino**

Run: `npx playwright test --project=unit tests/unit/targets.spec.ts`
Expected: PASS, 8 test

- [ ] **Step 6: Commit**

```bash
git add targets.json tests/lib/targets.ts tests/unit/targets.spec.ts
git commit -m "feat: targets.json e loader validato con i vincoli della spec"
```

---

### Task 3: Filtro degli errori in console con baseline

Il sito emette già un errore a riposo (spec §2.4). Questa attività isola la logica che distingue un errore **nuovo e di primo dominio** dal rumore, come funzione pura testabile senza browser.

**Files:**
- Create: `tests/lib/console-filter.ts`
- Test: `tests/unit/console-filter.spec.ts`

**Interfaces:**
- Consumes: `AcceptedConsoleError` da `tests/lib/targets.ts`
- Produces:
  - `type ConsoleRecord = { text: string; url?: string }`
  - `function isFirstParty(url: string | undefined, host: string): boolean`
  - `function unexpectedConsoleErrors(records: ConsoleRecord[], accepted: AcceptedConsoleError[], firstPartyHost: string): ConsoleRecord[]`

- [ ] **Step 1: Scrivi i test che devono fallire**

`tests/unit/console-filter.spec.ts`:

```typescript
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
```

L'ultimo test copre un'incertezza reale: non è accertato se Chromium attribuisca quell'errore a `gstatic` (dove nasce lo stack) o a `dev.bsg.it` (dove sta il chiamante MetForm). La voce in `targets.json` e il filtro di primo dominio lo neutralizzano in entrambi i casi.

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `npx playwright test --project=unit tests/unit/console-filter.spec.ts`
Expected: FAIL — `Cannot find module '../lib/console-filter'`

- [ ] **Step 3: Implementa `tests/lib/console-filter.ts`**

```typescript
import type { AcceptedConsoleError } from './targets';

export type ConsoleRecord = { text: string; url?: string };

export function isFirstParty(url: string | undefined, host: string): boolean {
  if (!url) return true;
  try {
    return new URL(url).host === host;
  } catch {
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
```

Un url non parsabile è trattato come primo dominio: meglio un falso positivo da indagare che una regressione persa.

- [ ] **Step 4: Esegui i test per verificare che passino**

Run: `npx playwright test --project=unit tests/unit/console-filter.spec.ts`
Expected: PASS, 6 test

- [ ] **Step 5: Commit**

```bash
git add tests/lib/console-filter.ts tests/unit/console-filter.spec.ts
git commit -m "feat: filtro errori console con baseline e scoping al primo dominio"
```

---

### Task 4: Le invarianti strutturali

Sostituiscono il confronto a pixel (spec D5). Ogni controllo restituisce una lista di `Finding` invece di lanciare, così il test riporta tutti i problemi di una pagina in un colpo. I casi negativi si provano con `page.setContent()`, che dà pagine deterministiche senza toccare il sito.

**Files:**
- Create: `tests/lib/page-health.ts`
- Test: `tests/site/page-health.spec.ts`

**Interfaces:**
- Consumes: `PageTarget` da `tests/lib/targets.ts`
- Produces:
  - `type Finding = { kind: string; detail: string }`
  - `function checkNoFatalError(page: Page): Promise<Finding[]>`
  - `function checkStylesheetsLoaded(page: Page): Promise<Finding[]>`
  - `function checkNoHorizontalOverflow(page: Page): Promise<Finding[]>`
  - `function checkImagesDecoded(page: Page, minimum: number): Promise<Finding[]>`
  - `function checkSelectorsPresent(page: Page, selectors: string[]): Promise<Finding[]>`
  - `function checkTitleNotEmpty(page: Page): Promise<Finding[]>`
  - `function checkPageHealth(page: Page, target: PageTarget): Promise<Finding[]>`

Questo file sta nel project `site` perché i suoi test hanno bisogno di un browser, pur non toccando la rete.

- [ ] **Step 1: Scrivi i test che devono fallire**

`tests/site/page-health.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import {
  checkNoFatalError,
  checkStylesheetsLoaded,
  checkNoHorizontalOverflow,
  checkImagesDecoded,
  checkSelectorsPresent,
  checkTitleNotEmpty,
  checkPageHealth,
} from '../lib/page-health';

test('checkNoFatalError segnala la pagina di errore critico di WordPress', async ({ page }) => {
  await page.setContent('<title>x</title><body>There has been a critical error on this website.</body>');
  expect(await checkNoFatalError(page)).toHaveLength(1);

  await page.setContent('<title>x</title><body>Si è verificato un errore critico sul tuo sito web.</body>');
  expect(await checkNoFatalError(page)).toHaveLength(1);

  await page.setContent('<title>x</title><body>tutto bene</body>');
  expect(await checkNoFatalError(page)).toEqual([]);
});

test('checkStylesheetsLoaded segnala una pagina senza fogli di stile', async ({ page }) => {
  await page.setContent('<title>x</title><body>niente css</body>');
  expect(await checkStylesheetsLoaded(page)).toHaveLength(1);

  await page.setContent('<title>x</title><style>body{color:red}</style><body>con css</body>');
  expect(await checkStylesheetsLoaded(page)).toEqual([]);
});

test('checkNoHorizontalOverflow segnala il layout che sfonda la viewport', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent('<title>x</title><body style="margin:0"><div style="width:5000px;height:10px"></div></body>');
  expect(await checkNoHorizontalOverflow(page)).toHaveLength(1);

  await page.setContent('<title>x</title><body style="margin:0"><div style="width:100px;height:10px"></div></body>');
  expect(await checkNoHorizontalOverflow(page)).toEqual([]);
});

test('checkImagesDecoded conta solo le immagini realmente decodificate', async ({ page }) => {
  const pngValido =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
  await page.setContent(`<title>x</title><body><img src="${pngValido}"></body>`);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  expect(await checkImagesDecoded(page, 1)).toEqual([]);

  await page.setContent('<title>x</title><body><img src="data:image/png;base64,rotto"></body>');
  expect(await checkImagesDecoded(page, 1)).toHaveLength(1);

  await page.setContent('<title>x</title><body>nessuna immagine</body>');
  expect(await checkImagesDecoded(page, 0)).toEqual([]);
});

test('checkSelectorsPresent segnala i selettori mancanti uno per uno', async ({ page }) => {
  await page.setContent('<title>x</title><body><header>h</header></body>');
  expect(await checkSelectorsPresent(page, ['header'])).toEqual([]);
  const findings = await checkSelectorsPresent(page, ['header', 'footer', 'nav']);
  expect(findings).toHaveLength(2);
  expect(findings.map((f) => f.detail).join(' ')).toContain('footer');
});

test('checkTitleNotEmpty segnala un title vuoto', async ({ page }) => {
  await page.setContent('<title></title><body>x</body>');
  expect(await checkTitleNotEmpty(page)).toHaveLength(1);
  await page.setContent('<title>BSG</title><body>x</body>');
  expect(await checkTitleNotEmpty(page)).toEqual([]);
});

test('checkPageHealth aggrega tutti i controlli', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent('<title></title><body style="margin:0"><div style="width:5000px;height:10px"></div></body>');
  const findings = await checkPageHealth(page, { path: '/x', expect: ['footer'], criticalImages: 0 });
  const kinds = findings.map((f) => f.kind).sort();
  expect(kinds).toEqual(['horizontal-overflow', 'missing-selector', 'no-stylesheets', 'title-empty']);
});
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `npx playwright test --project=site tests/site/page-health.spec.ts`
Expected: FAIL — `Cannot find module '../lib/page-health'`

- [ ] **Step 3: Implementa `tests/lib/page-health.ts`**

```typescript
import type { Page } from '@playwright/test';
import type { PageTarget } from './targets';

export type Finding = { kind: string; detail: string };

const MARCATORI_FATAL = [
  'There has been a critical error',
  'Si è verificato un errore critico',
  'Fatal error:',
  'Parse error:',
];

export async function checkNoFatalError(page: Page): Promise<Finding[]> {
  const testo = await page.evaluate(() => document.body?.innerText ?? '');
  const trovato = MARCATORI_FATAL.find((m) => testo.includes(m));
  return trovato ? [{ kind: 'fatal-error', detail: `la pagina contiene "${trovato}"` }] : [];
}

export async function checkStylesheetsLoaded(page: Page): Promise<Finding[]> {
  const conRegole = await page.evaluate(() =>
    Array.from(document.styleSheets).some((s) => {
      try {
        return s.cssRules.length > 0;
      } catch {
        // foglio cross-origin: l'accesso alle regole lancia, ma il foglio è caricato
        return true;
      }
    }),
  );
  return conRegole ? [] : [{ kind: 'no-stylesheets', detail: 'nessun foglio di stile con regole' }];
}

export async function checkNoHorizontalOverflow(page: Page): Promise<Finding[]> {
  const { scroll, viewport } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  // 2px di tolleranza per gli arrotondamenti subpixel
  return scroll > viewport + 2
    ? [{ kind: 'horizontal-overflow', detail: `scrollWidth ${scroll} > viewport ${viewport}` }]
    : [];
}

export async function checkImagesDecoded(page: Page, minimum: number): Promise<Finding[]> {
  if (minimum <= 0) return [];
  const decodificate = await page.evaluate(
    () => Array.from(document.images).filter((i) => i.naturalWidth > 0).length,
  );
  return decodificate < minimum
    ? [{ kind: 'images-not-decoded', detail: `immagini decodificate ${decodificate}, attese almeno ${minimum}` }]
    : [];
}

export async function checkSelectorsPresent(page: Page, selectors: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const sel of selectors) {
    if ((await page.locator(sel).count()) === 0) {
      findings.push({ kind: 'missing-selector', detail: `selettore assente: ${sel}` });
    }
  }
  return findings;
}

export async function checkTitleNotEmpty(page: Page): Promise<Finding[]> {
  const titolo = (await page.title()).trim();
  return titolo === '' ? [{ kind: 'title-empty', detail: 'title vuoto' }] : [];
}

export async function checkPageHealth(page: Page, target: PageTarget): Promise<Finding[]> {
  return [
    ...(await checkNoFatalError(page)),
    ...(await checkStylesheetsLoaded(page)),
    ...(await checkNoHorizontalOverflow(page)),
    ...(await checkImagesDecoded(page, target.criticalImages)),
    ...(await checkSelectorsPresent(page, target.expect)),
    ...(await checkTitleNotEmpty(page)),
  ];
}
```

- [ ] **Step 4: Esegui i test per verificare che passino**

Run: `npx playwright test --project=site tests/site/page-health.spec.ts`
Expected: PASS, 7 test

- [ ] **Step 5: Commit**

```bash
git add tests/lib/page-health.ts tests/site/page-health.spec.ts
git commit -m "feat: invarianti strutturali di pagina con casi negativi deterministici"
```

---

### Task 5: Fixture di soppressione degli overlay

Banner cookie, popup Hustle e chat widget intercettano i click e sono la causa più probabile di instabilità su questo sito (spec §7). La fixture li neutralizza **prima** del caricamento, così vale anche per il test del form.

**Files:**
- Create: `tests/fixtures/clean-page.ts`
- Test: `tests/site/clean-page.spec.ts`

**Interfaces:**
- Consumes: la config del Task 1
- Produces: `export const test` con la fixture `cleanPage: Page`, e `export { expect }`. Dal Task 6 in avanti i test del sito importano `test` ed `expect` da qui invece che da `@playwright/test`.

- [ ] **Step 1: Scrivi il test che deve fallire**

`tests/site/clean-page.spec.ts`:

```typescript
import { test, expect } from '../fixtures/clean-page';

test('sulla pagina contatti i tre overlay non sono visibili', async ({ cleanPage }) => {
  await cleanPage.goto('/contact-us/', { waitUntil: 'load' });

  for (const selettore of ['#cookie-notice', '#ai-chat-widget-root']) {
    const locator = cleanPage.locator(selettore);
    if ((await locator.count()) > 0) {
      await expect(locator.first()).toBeHidden();
    }
  }

  const hustle = cleanPage.locator('[class*="hustle-modal"], [class*="hustle-slidein"], [class*="hustle-popup"]');
  for (let i = 0; i < (await hustle.count()); i++) {
    await expect(hustle.nth(i)).toBeHidden();
  }
});

test('il pulsante di invio del form è cliccabile senza ostruzioni', async ({ cleanPage }) => {
  await cleanPage.goto('/contact-us/', { waitUntil: 'load' });
  const invia = cleanPage.locator('.metform-submit-btn');
  await expect(invia).toBeVisible();
  // se un overlay coprisse il pulsante, questo scatterebbe in timeout
  await expect(invia).toBeEnabled();
  await invia.scrollIntoViewIfNeeded();
});
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `npx playwright test --project=site tests/site/clean-page.spec.ts`
Expected: FAIL — `Cannot find module '../fixtures/clean-page'`

- [ ] **Step 3: Implementa `tests/fixtures/clean-page.ts`**

```typescript
import { test as base, type Page } from '@playwright/test';

const CSS_SOPPRESSIONE = [
  '#cookie-notice',
  '#ai-chat-widget-root',
  '[class*="hustle-modal"]',
  '[class*="hustle-slidein"]',
  '[class*="hustle-popup"]',
].join(',') + '{display:none !important}';

export const test = base.extend<{ cleanPage: Page }>({
  cleanPage: async ({ page, context, baseURL }, use) => {
    // il plugin cookie-notice legge questo cookie e non mostra il banner
    await context.addCookies([
      { name: 'cookie_notice_accepted', value: 'true', url: baseURL! },
    ]);

    await page.addInitScript((css: string) => {
      const applica = () => {
        const style = document.createElement('style');
        style.id = 'bsg-test-overlay-suppression';
        style.textContent = css;
        (document.head ?? document.documentElement).appendChild(style);
      };
      if (document.head) applica();
      else document.addEventListener('DOMContentLoaded', applica, { once: true });
    }, CSS_SOPPRESSIONE);

    await use(page);
  },
});

export { expect } from '@playwright/test';
```

Il nome del cookie `cookie_notice_accepted` è quello usato dal plugin `cookie-notice`. Se al primo run il banner comparisse comunque, il CSS di soppressione lo copre già: si annoti qui il nome corretto letto da DevTools e si corregga.

La soppressione usa `display:none` e non `visibility:hidden` di proposito: un popup che resta nel flusso può causare overflow orizzontale e far fallire `checkNoHorizontalOverflow` per un motivo che non è una regressione.

- [ ] **Step 4: Esegui il test per verificare che passi**

Run: `npx playwright test --project=site tests/site/clean-page.spec.ts`
Expected: PASS, 2 test

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/clean-page.ts tests/site/clean-page.spec.ts
git commit -m "feat: fixture che sopprime banner cookie, popup Hustle e chat widget"
```

---

### Task 6: Lo smoke test dichiarativo

Mette insieme i pezzi: un test per ogni pagina di `targets.json`, che raccoglie errori console e richieste fallite durante la navigazione e poi valuta le invarianti.

**Files:**
- Create: `tests/lib/collectors.ts`
- Create: `tests/site/smoke.spec.ts`
- Delete: `tests/site/reachability.spec.ts` (assorbito dallo smoke, che copre la homepage con più controlli)

**Interfaces:**
- Consumes: `loadTargets` (Task 2), `unexpectedConsoleErrors` (Task 3), `checkPageHealth` (Task 4), la fixture `cleanPage` (Task 5)
- Produces:
  - `type FailedRequest = { url: string; reason: string }`
  - `type Collected = { consoleErrors: ConsoleRecord[]; failedRequests: FailedRequest[] }`
  - `function attachCollectors(page: Page, firstPartyHost: string): Collected`

- [ ] **Step 1: Scrivi il test che deve fallire**

`tests/site/smoke.spec.ts`:

```typescript
import { test, expect } from '../fixtures/clean-page';
import { loadTargets } from '../lib/targets';
import { attachCollectors } from '../lib/collectors';
import { unexpectedConsoleErrors } from '../lib/console-filter';
import { checkPageHealth } from '../lib/page-health';

const targets = loadTargets();
const host = new URL(targets.baseUrl).host;

for (const target of targets.pages) {
  test(`smoke ${target.path}`, async ({ cleanPage }) => {
    const raccolto = attachCollectors(cleanPage, host);

    const response = await cleanPage.goto(target.path, { waitUntil: 'load' });
    expect(response, `nessuna risposta per ${target.path}`).not.toBeNull();
    expect(response!.status(), `status finale di ${target.path}`).toBe(200);

    const findings = await checkPageHealth(cleanPage, target);
    expect(findings, `invarianti strutturali su ${target.path}`).toEqual([]);

    const consoleInattesi = unexpectedConsoleErrors(
      raccolto.consoleErrors,
      targets.acceptedConsoleErrors,
      host,
    );
    expect(consoleInattesi, `errori console nuovi su ${target.path}`).toEqual([]);

    expect(raccolto.failedRequests, `richieste di primo dominio fallite su ${target.path}`).toEqual([]);
  });
}
```

- [ ] **Step 2: Esegui il test per verificare che fallisca**

Run: `npx playwright test --project=site tests/site/smoke.spec.ts`
Expected: FAIL — `Cannot find module '../lib/collectors'`

- [ ] **Step 3: Implementa `tests/lib/collectors.ts`**

```typescript
import type { Page } from '@playwright/test';
import type { ConsoleRecord } from './console-filter';
import { isFirstParty } from './console-filter';

export type FailedRequest = { url: string; reason: string };
export type Collected = { consoleErrors: ConsoleRecord[]; failedRequests: FailedRequest[] };

export function attachCollectors(page: Page, firstPartyHost: string): Collected {
  const raccolto: Collected = { consoleErrors: [], failedRequests: [] };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    raccolto.consoleErrors.push({ text: msg.text(), url: msg.location()?.url });
  });

  page.on('pageerror', (err) => {
    raccolto.consoleErrors.push({ text: `pageerror: ${err.message}`, url: undefined });
  });

  page.on('requestfailed', (req) => {
    if (!isFirstParty(req.url(), firstPartyHost)) return;
    raccolto.failedRequests.push({
      url: req.url(),
      reason: req.failure()?.errorText ?? 'sconosciuto',
    });
  });

  page.on('response', (res) => {
    if (res.status() < 400) return;
    if (!isFirstParty(res.url(), firstPartyHost)) return;
    // la navigazione principale è già coperta dall'asserzione sullo status
    if (res.request().resourceType() === 'document') return;
    raccolto.failedRequests.push({ url: res.url(), reason: `HTTP ${res.status()}` });
  });

  return raccolto;
}
```

Le richieste fallite sono limitate al primo dominio: è ciò che rende superflua una baseline anche per loro, perché il rumore di terze parti (tracker, pixel, script bloccati) non entra.

- [ ] **Step 4: Rimuovi il test di raggiungibilità, ora ridondante**

```bash
git rm tests/site/reachability.spec.ts
```

Lo smoke sulla homepage copre lo stesso controllo e molti altri.

- [ ] **Step 5: Esegui lo smoke completo**

Run: `npx playwright test --project=site tests/site/smoke.spec.ts`
Expected: PASS su 16 test.

**Questo è il punto in cui la realtà interviene.** È probabile che al primo run alcune pagine falliscano per motivi legittimi e non per regressioni: `header`/`nav`/`footer` potrebbero non esistere come tag sul tema `most`, `criticalImages` potrebbe essere tarato male, o potrebbe emergere un errore console non ancora in baseline. Per ogni fallimento si decida esplicitamente:

- **invariante troppo severa** → si corregga `targets.json` (selettori o soglia immagini)
- **errore console preesistente e innocuo** → si aggiunga a `acceptedConsoleErrors` **con la sua motivazione**, come impone il validatore
- **difetto vero del sito** → si annoti e si riporti all'utente, non si silenzi

Non si passi al Task 7 finché lo smoke non è verde per ragioni comprese.

- [ ] **Step 6: Commit**

```bash
git add tests/lib/collectors.ts tests/site/smoke.spec.ts targets.json
git commit -m "feat: smoke test dichiarativo su tutte le pagine di targets.json"
```

---

### Task 7: Il test del form di contatto

Tre test con severità crescente. I primi due funzionano sempre; il terzo, l'invio reale, dipende dalle chiavi reCAPTCHA di test (spec D9, questione aperta §12.5) e resta `skip` documentato finché non ci sono.

**Files:**
- Create: `tests/site/contact-form.spec.ts`

**Interfaces:**
- Consumes: la fixture `cleanPage` (Task 5)
- Produces: niente per le attività successive

- [ ] **Step 1: Scrivi i test che devono fallire**

`tests/site/contact-form.spec.ts`:

```typescript
import { test, expect } from '../fixtures/clean-page';

const PERCORSO = '/contact-us/';
const RUN_ID = process.env.RUN_ID ?? `local-${Date.now()}`;
const INVIO_ABILITATO = process.env.RECAPTCHA_TEST_KEYS === 'true';

const CAMPI = {
  nome: 'input[name="mf-first-name"]',
  email: 'input[name="mf-email"]',
  oggetto: 'input[name="mf-subject"]',
  messaggio: 'textarea[name="mf-textarea"]',
  consenso: 'input[name="mf-gdpr-consent"]',
  invia: '.metform-submit-btn',
};

test('il form è idratato e i campi attesi esistono', async ({ cleanPage }) => {
  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });

  const form = cleanPage.locator('.metform-form-content');
  await expect(form).toBeVisible();

  for (const [etichetta, selettore] of Object.entries(CAMPI)) {
    await expect(form.locator(selettore), `campo ${etichetta}`).toHaveCount(1);
  }
});

test('il widget reCAPTCHA v2 è renderizzato dentro il form', async ({ cleanPage }) => {
  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });

  const anchor = cleanPage.locator(
    '.metform-form-content .g-recaptcha iframe[src*="api2/anchor"]',
  );
  await expect(anchor).toHaveCount(1);
});

test('l\'endpoint REST accetta la submission', async ({ cleanPage }) => {
  test.skip(
    !INVIO_ABILITATO,
    'Richiede le chiavi reCAPTCHA di test su dev — spec D9 e questione aperta §12.5',
  );

  await cleanPage.goto(PERCORSO, { waitUntil: 'load' });
  const form = cleanPage.locator('.metform-form-content');

  await form.locator(CAMPI.nome).fill('Test automatico');
  await form.locator(CAMPI.email).fill('qa@bsg.it');
  await form.locator(CAMPI.oggetto).fill(`Test post-aggiornamento ${RUN_ID}`);
  await form.locator(CAMPI.messaggio).fill(
    `Invio automatico della suite post-aggiornamento. RUN_ID=${RUN_ID}. Non rispondere.`,
  );
  await form.locator(CAMPI.consenso).check();

  const casella = cleanPage
    .frameLocator('.metform-form-content iframe[src*="api2/anchor"]')
    .locator('#recaptcha-anchor');
  await casella.click();
  await expect(casella).toHaveAttribute('aria-checked', 'true');

  const attesaRisposta = cleanPage.waitForResponse(
    (r) => r.url().includes('/metform/v1/entries') && r.request().method() === 'POST',
  );
  await form.locator(CAMPI.invia).click();
  const risposta = await attesaRisposta;

  expect(risposta.status(), 'status della submission REST').toBeGreaterThanOrEqual(200);
  expect(risposta.status(), 'status della submission REST').toBeLessThan(300);
});
```

Nessuna asserzione sul testo mostrato in pagina, per il principio della spec D8: la conferma oggi non arriva mai perché la posta non è configurata, e il messaggio d'errore sparirebbe il giorno in cui un mailer venisse configurato, rendendo rossa la suite per aver funzionato.

- [ ] **Step 2: Esegui i test per verificare lo stato di partenza**

Run: `npx playwright test --project=site tests/site/contact-form.spec.ts`
Expected: i primi due PASS (i selettori sono quelli rilevati l'08/09/2026), il terzo SKIPPED con la motivazione in chiaro.

Se uno dei primi due fallisse, i `name` dei campi sono cambiati: si rilevino di nuovo dal DOM idratato e si aggiorni la costante `CAMPI` **e** la spec §2.2.

- [ ] **Step 3: Verifica il ramo di invio, se le chiavi di test sono disponibili**

Solo se la questione aperta §12.5 è stata risolta configurando le chiavi reCAPTCHA di test su dev:

Run: `RECAPTCHA_TEST_KEYS=true npx playwright test --project=site tests/site/contact-form.spec.ts`
Expected: PASS su 3 test.

Se il click sulla casella non porta `aria-checked` a `true`, le chiavi di test non sono attive: si verifichi la configurazione in MetForm e non si forzi il test.

- [ ] **Step 4: Commit**

```bash
git add tests/site/contact-form.spec.ts
git commit -m "feat: test del form MetForm fino alla risposta REST, invio dietro flag"
```

---

### Task 8: Logica pura di pianificazione dei CIDR

La parte pericolosa del sistema — riscrivere una regola di firewall — viene isolata come funzione pura e coperta da test, prima di toccare AWS. È `.mjs` perché deve girare nel workflow con `node` senza transpilazione.

**Files:**
- Create: `scripts/lib/cidr-plan.mjs`
- Create: `firewall-allowlist.json`
- Test: `scripts/lib/cidr-plan.test.mjs`

**Interfaces:**
- Consumes: niente
- Produces:
  - `function normalizeCidr(ipOrCidr: string): string`
  - `function findPortState(portStates: object[], port: number, protocol?: string): object | null`
  - `function planOpen(portStates: object[], runnerIp: string, port?: number): { fromPort, toPort, protocol, cidrs }`
  - `function planRestore(portStates: object[], port?: number): { fromPort, toPort, protocol, cidrs } | null` — `null` significa che la porta era chiusa e va richiusa con `close-instance-public-ports`

- [ ] **Step 1: Scrivi i test che devono fallire**

`scripts/lib/cidr-plan.test.mjs`:

```javascript
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

test('planOpen non duplica un IP già presente', () => {
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
```

- [ ] **Step 2: Esegui i test per verificare che falliscano**

Run: `node --test scripts/lib/`
Expected: FAIL — `Cannot find module './cidr-plan.mjs'`

- [ ] **Step 3: Implementa `scripts/lib/cidr-plan.mjs`**

```javascript
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

export function planOpen(portStates, runnerIp, port = PORTA_DEFAULT) {
  const stato = findPortState(portStates, port);
  const esistenti = stato ? [...stato.cidrs] : [];
  const nuovo = normalizeCidr(runnerIp);
  const cidrs = esistenti.includes(nuovo) ? esistenti : [...esistenti, nuovo];
  return { fromPort: port, toPort: port, protocol: PROTOCOLLO_DEFAULT, cidrs };
}

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
```

- [ ] **Step 4: Aggiungi lo script npm ed esegui i test**

I test in `.mjs` girano con il runner di Node, non con Playwright, quindi vanno in uno script a parte. In `package.json` sostituisci il blocco `scripts` con:

```json
  "scripts": {
    "test:scripts": "node --test \"scripts/**/*.test.mjs\"",
    "test:unit": "playwright test --project=unit --pass-with-no-tests",
    "test:site": "playwright test --project=site",
    "test": "npm run test:scripts && npm run test:unit && npm run test:site"
  },
```

Run: `npm run test:scripts`
Expected: PASS, 8 test

- [ ] **Step 5: Crea `firewall-allowlist.json`**

È la fonte di verità per il workflow di riconciliazione (Task 11). I valori vanno riempiti con i CIDR reali letti da Lightsail → Networking → IPv4 Firewall (questione aperta §12.2). Fino ad allora il file resta con la struttura e un CIDR di esempio **commentato nel README**, e il Task 11 non va eseguito.

```json
{
  "portStates": [
    { "fromPort": 80, "toPort": 80, "protocol": "tcp", "cidrs": [] },
    { "fromPort": 443, "toPort": 443, "protocol": "tcp", "cidrs": [] }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/cidr-plan.mjs scripts/lib/cidr-plan.test.mjs firewall-allowlist.json
git commit -m "feat: pianificazione pura dei CIDR con read-modify-restore testato"
```

---

### Task 9: Script di manipolazione del firewall

**Prerequisito:** questioni aperte §12.1 (nome istanza, regione) e §12.3 (ruolo IAM) risolte.

Il guscio di I/O attorno alla logica del Task 8. Deliberatamente sottile: legge lo stato, chiama il pianificatore, scrive.

**Files:**
- Create: `scripts/firewall.mjs`

**Interfaces:**
- Consumes: `planOpen`, `planRestore` da `scripts/lib/cidr-plan.mjs`
- Produces: una CLI con due comandi:
  - `node scripts/firewall.mjs open --instance NOME --region REGIONE --ip IP --state-file PATH`
  - `node scripts/firewall.mjs restore --instance NOME --region REGIONE --state-file PATH`

- [ ] **Step 1: Implementa `scripts/firewall.mjs`**

Questa attività non ha un test automatico: le sue uniche due funzioni sono invocare l'AWS CLI e delegare alla logica già testata nel Task 8. Il collaudo è la verifica manuale dello Step 2, che è anche l'unica prova significativa possibile.

```javascript
#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { planOpen, planRestore } from './lib/cidr-plan.mjs';

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
  return res.portStates ?? [];
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

const comando = process.argv[2];
const instance = arg('instance');
const region = arg('region');
const stateFile = arg('state-file');
const PORTA = 443;

if (comando === 'open') {
  const ip = arg('ip');
  const originale = leggiStato(instance, region);
  writeFileSync(stateFile, JSON.stringify(originale, null, 2));
  const piano = planOpen(originale, ip, PORTA);
  scriviPorta(instance, region, piano);
  console.log(`443 aperta a ${piano.cidrs.length} CIDR (aggiunto ${ip}); stato originale salvato in ${stateFile}`);
} else if (comando === 'restore') {
  const originale = JSON.parse(readFileSync(stateFile, 'utf8'));
  const piano = planRestore(originale, PORTA);
  if (piano === null) {
    chiudiPorta(instance, region, PORTA);
    console.log('443 era chiusa in origine: richiusa');
  } else {
    scriviPorta(instance, region, piano);
    console.log(`443 ripristinata ai ${piano.cidrs.length} CIDR originali`);
  }
} else {
  console.error('uso: firewall.mjs open|restore --instance NOME --region REGIONE [--ip IP] --state-file PATH');
  process.exit(2);
}
```

Si usa `open-instance-public-ports` e non `put-instance-public-ports`: quest'ultima chiuderebbe tutte le porte non elencate, cancellando l'allowlist dell'ufficio (spec D3).

- [ ] **Step 2: Verifica manuale contro l'istanza reale**

Con credenziali AWS locali che abbiano i permessi della spec §8:

```bash
aws lightsail get-instance-port-states --instance-name NOME --region REGIONE --output json
node scripts/firewall.mjs open --instance NOME --region REGIONE --ip 203.0.113.99 --state-file /tmp/fw.json
aws lightsail get-instance-port-states --instance-name NOME --region REGIONE --output json
node scripts/firewall.mjs restore --instance NOME --region REGIONE --state-file /tmp/fw.json
aws lightsail get-instance-port-states --instance-name NOME --region REGIONE --output json
```

Expected: dopo `open` la 443 contiene i CIDR originali più `203.0.113.99/32`; dopo `restore` lo stato è **identico** al primo comando. Si confrontino i tre output riga per riga.

Se dopo `open` i CIDR originali fossero sparsiti invece che preservati, l'assunzione della spec D3 sul comportamento di `open-instance-public-ports` è errata: si fermi il lavoro, si annoti nella spec e si valuti `put-instance-public-ports` passando l'intero insieme di porte — con il rischio di lockout esplicitato all'utente prima di procedere.

- [ ] **Step 3: Commit**

```bash
git add scripts/firewall.mjs
git commit -m "feat: script open/restore del firewall Lightsail via AWS CLI"
```

---

### Task 10: Workflow di test post-aggiornamento

**Prerequisito:** Task 9 verificato, e questione aperta §12.4 (repo GitHub) risolta.

**Files:**
- Create: `.github/workflows/post-update.yml`

**Interfaces:**
- Consumes: `scripts/firewall.mjs` (Task 9), gli script npm del Task 1
- Produces: il workflow lanciabile da UI, `gh workflow run` o app mobile

- [ ] **Step 1: Crea il workflow**

```yaml
name: Test post-aggiornamento

on:
  workflow_dispatch:
    inputs:
      note:
        description: "Cosa hai aggiornato (finisce nel titolo del run e nel report)"
        required: true
        type: string

run-name: "Post-update — ${{ inputs.note }}"

permissions:
  id-token: write
  contents: read

# due run che manipolano il firewall insieme si sovrascriverebbero a vicenda:
# vanno serializzati, e mai cancellati a metà o il ripristino non avviene
concurrency:
  group: dev-bsg-firewall
  cancel-in-progress: false

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      LIGHTSAIL_INSTANCE_NAME: ${{ vars.LIGHTSAIL_INSTANCE_NAME }}
      AWS_REGION: ${{ vars.AWS_REGION }}
      STATE_FILE: ${{ github.workspace }}/firewall-state.json
      RUN_ID: ${{ github.run_id }}-${{ github.run_attempt }}
      RECAPTCHA_TEST_KEYS: ${{ vars.RECAPTCHA_TEST_KEYS }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - name: Cache dei browser Playwright
        id: cache-browser
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}

      - name: Installa Chromium
        run: npx playwright install --with-deps chromium

      - name: Test unitari (nessuna rete, nessun firewall)
        run: npm run test:scripts && npm run test:unit

      - name: Credenziali AWS via OIDC
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Rileva l'IP pubblico del runner
        id: ip
        run: echo "value=$(curl -sS --max-time 10 https://checkip.amazonaws.com)" >> "$GITHUB_OUTPUT"

      - name: Apri la 443 per il runner
        run: >
          node scripts/firewall.mjs open
          --instance "$LIGHTSAIL_INSTANCE_NAME"
          --region "$AWS_REGION"
          --ip "${{ steps.ip.outputs.value }}"
          --state-file "$STATE_FILE"

      - name: Test sul sito
        run: npm run test:site

      - name: Ripristina il firewall
        if: always()
        run: >
          node scripts/firewall.mjs restore
          --instance "$LIGHTSAIL_INSTANCE_NAME"
          --region "$AWS_REGION"
          --state-file "$STATE_FILE"

      - name: Carica report e tracce
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report-${{ github.run_id }}
          path: |
            playwright-report/
            test-results/
          retention-days: 14
```

Lo step di ripristino sta in `if: always()` e **dopo** i test, così un fallimento o un timeout della suite non lascia la porta aperta. La `concurrency` con `cancel-in-progress: false` è parte del meccanismo di sicurezza, non un'ottimizzazione: una cancellazione a metà run salterebbe il ripristino.

- [ ] **Step 2: Configura variabili e secret nel repo**

Da fare nell'interfaccia GitHub, in Settings → Secrets and variables → Actions:

| Nome | Tipo | Valore |
|---|---|---|
| `LIGHTSAIL_INSTANCE_NAME` | Variable | nome esatto dell'istanza |
| `AWS_REGION` | Variable | regione dell'istanza |
| `RECAPTCHA_TEST_KEYS` | Variable | `true` solo se le chiavi di test sono configurate su dev, altrimenti `false` |
| `AWS_ROLE_ARN` | Secret | ARN del ruolo assumibile via OIDC |

Il ruolo IAM va creato con trust policy verso `token.actions.githubusercontent.com` limitata a questo repo, e permessi limitati a `lightsail:GetInstancePortStates`, `lightsail:OpenInstancePublicPorts`, `lightsail:CloseInstancePublicPorts` sull'ARN della singola istanza. **`lightsail:PutInstancePublicPorts` non va concessa** (spec D3).

- [ ] **Step 3: Esegui il workflow e verifica**

```bash
gh workflow run post-update.yml -f note="prima esecuzione, nessun aggiornamento"
gh run watch
```

Expected: run verde. Poi si verifichi a mano che il firewall sia tornato allo stato di partenza:

```bash
aws lightsail get-instance-port-states --instance-name NOME --region REGIONE --output json
```

- [ ] **Step 4: Verifica il comportamento in caso di fallimento**

Si introduca temporaneamente un fallimento (per esempio un path inesistente in `targets.json` su un branch di prova), si lanci il workflow, e si verifichi che: il run è rosso, il report è fra gli artifact, **e il firewall è comunque stato ripristinato**. Poi si annulli la modifica.

Questa verifica è il punto di tutto il meccanismo: non si consideri l'attività completa senza averla fatta.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/post-update.yml
git commit -m "feat: workflow manuale di test post-aggiornamento con apertura firewall"
```

---

### Task 11: Workflow di riconciliazione del firewall

**Prerequisito:** Task 10 funzionante, e `firewall-allowlist.json` riempito con i CIDR reali (questione aperta §12.2).

Se un runner viene ucciso in modo brutale, `if: always()` può non eseguire e la porta resta aperta. Questo workflow è la rete di sicurezza, e **fallisce** quando trova una differenza, così la si viene a sapere.

**Files:**
- Create: `scripts/reconcile-firewall.mjs`
- Create: `.github/workflows/firewall-reconcile.yml`

**Interfaces:**
- Consumes: `firewall-allowlist.json` (Task 8), `findPortState` da `scripts/lib/cidr-plan.mjs`
- Produces: niente per le attività successive

- [ ] **Step 1: Implementa `scripts/reconcile-firewall.mjs`**

```javascript
#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { findPortState } from './lib/cidr-plan.mjs';

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1 || !process.argv[i + 1]) throw new Error(`argomento mancante: --${nome}`);
  return process.argv[i + 1];
}

function aws(args) {
  const out = execFileSync('aws', args, { encoding: 'utf8' });
  return out.trim() ? JSON.parse(out) : null;
}

const instance = arg('instance');
const region = arg('region');
const atteso = JSON.parse(readFileSync(arg('allowlist'), 'utf8')).portStates;

const attuale = (aws([
  'lightsail', 'get-instance-port-states',
  '--instance-name', instance, '--region', region, '--output', 'json',
]).portStates) ?? [];

const derive = [];

for (const desiderato of atteso) {
  const trovato = findPortState(attuale, desiderato.fromPort, desiderato.protocol);
  const attualiCidr = trovato ? [...trovato.cidrs].sort() : [];
  const attesiCidr = [...desiderato.cidrs].sort();
  if (JSON.stringify(attualiCidr) !== JSON.stringify(attesiCidr)) {
    derive.push({ porta: desiderato.fromPort, attuali: attualiCidr, attesi: attesiCidr });
    aws([
      'lightsail', 'open-instance-public-ports',
      '--instance-name', instance, '--region', region,
      '--port-info', `fromPort=${desiderato.fromPort},toPort=${desiderato.toPort},protocol=${desiderato.protocol},cidrs=${desiderato.cidrs.join(',')}`,
      '--output', 'json',
    ]);
  }
}

if (derive.length === 0) {
  console.log('firewall conforme alla allowlist committata');
  process.exit(0);
}

console.error('DERIVA RILEVATA E CORRETTA:');
for (const d of derive) {
  console.error(`  porta ${d.porta}: trovati [${d.attuali.join(', ')}], attesi [${d.attesi.join(', ')}]`);
}
console.error('');
console.error('Se la modifica era legittima, aggiorna firewall-allowlist.json e committa.');
console.error('Se non lo era, un run precedente ha lasciato la porta aperta: indaga.');
process.exit(1);
```

- [ ] **Step 2: Crea `.github/workflows/firewall-reconcile.yml`**

```yaml
name: Riconciliazione firewall

on:
  schedule:
    - cron: "17 3 * * *"
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

concurrency:
  group: dev-bsg-firewall
  cancel-in-progress: false

jobs:
  reconcile:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Riporta il firewall alla allowlist committata
        run: >
          node scripts/reconcile-firewall.mjs
          --instance "${{ vars.LIGHTSAIL_INSTANCE_NAME }}"
          --region "${{ vars.AWS_REGION }}"
          --allowlist firewall-allowlist.json
```

Condivide il gruppo `concurrency` con il workflow di test: la riconciliazione non deve mai girare mentre un run di test ha la porta legittimamente aperta, o la chiuderebbe sotto i piedi ai test.

- [ ] **Step 3: Verifica su deriva simulata**

```bash
# introduci una deriva controllata
aws lightsail open-instance-public-ports --instance-name NOME --region REGIONE \
  --port-info fromPort=443,toPort=443,protocol=tcp,cidrs=<CIDR_ATTUALI>,203.0.113.99/32

gh workflow run firewall-reconcile.yml
gh run watch
```

Expected: il run **fallisce**, il log elenca la deriva con i CIDR trovati e attesi, e una successiva lettura dello stato mostra il firewall riportato alla allowlist. Un secondo run manuale deve passare in verde.

- [ ] **Step 4: Commit**

```bash
git add scripts/reconcile-firewall.mjs .github/workflows/firewall-reconcile.yml
git commit -m "feat: riconciliazione giornaliera del firewall che fallisce sulla deriva"
```

---

### Task 12: Chiusura del README

**Nota del 09/09/2026:** questa attività produceva anche un documento di procedura,
eliminato su richiesta dell'utente insieme a tutta la documentazione di quel tema. Il
testo originale del compito è stato rimosso da questa cronaca per coerenza. Resta a
verbale soltanto che il README è stato completato.

## Verifica finale del piano contro la spec

| Requisito della spec | Attività che lo implementa |
|---|---|
| D1 trigger manuale con campo note | Task 10 |
| D2 runner GitHub-hosted | Task 10 |
| D3 allowlist dinamica read-modify-restore, no `Put` | Task 8, 9, 10 |
| D4 HTTPS con `ignoreHTTPSErrors`, mai HTTP | Task 1 (config), Task 2 (validatore rifiuta http) |
| D5 smoke dichiarativo con invarianti strutturali | Task 2, 4, 6 |
| D6 baseline degli errori console | Task 3, con motivazione obbligatoria imposta dal Task 2 |
| D7 nessun accesso a wp-admin | rispettato per costruzione: nessuna attività crea credenziali |
| D8 form fino alla risposta REST, nessuna asserzione sul testo | Task 7 |
| D9 chiavi reCAPTCHA di test solo su dev | Task 7, dietro `RECAPTCHA_TEST_KEYS` |
| D10 rimossa | — |
| D11 nessun mailer su dev | rispettato per costruzione |
| D12 indipendenza dalla macchina | rispettato per costruzione: nessuna attività installa o esegue nulla sull'istanza |
| §7 fixture overlay | Task 5 |
| §8 sicurezza, `if: always()`, riconciliazione, Wordfence | Task 10, 11; `workers: 1` e User-Agent nel Task 1 |
| §9 cache dei browser per il costo | Task 10 |
| §11 limiti di copertura dichiarati | Task 12, nel README |
