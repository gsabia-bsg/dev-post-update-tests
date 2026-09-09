# Test automatizzati post-aggiornamento — dev.bsg.it

**Data:** 8 settembre 2026
**Stato:** design approvato, non ancora implementato
**Ambito:** solo `dev.bsg.it` (staging). La produzione non è toccata da questo sistema.

---

## 1. Obiettivo

Dopo ogni aggiornamento manuale di WordPress, di un plugin o del tema su `dev.bsg.it`, poter verificare in pochi minuti — premendo un pulsante — che il sito non si sia rotto, con una diagnosi utilizzabile quando qualcosa fallisce.

**Fuori ambito, deliberatamente:**

- eseguire gli aggiornamenti (restano manuali, da wp-admin)
- rollback automatico (resta una procedura manuale documentata)
- testare la produzione
- monitoraggio continuo o uptime check

---

## 2. Stato dell'ambiente rilevato l'8 settembre 2026

Questi fatti sono stati verificati direttamente e hanno determinato le decisioni della sezione 3. Vanno riverificati se l'ambiente cambia.

| Aspetto | Rilevazione |
|---|---|
| Hosting | AWS Lightsail, IP statico `3.73.112.45` |
| Certificato TLS | Self-signed, `CN=3.73.112.45`, SAN contiene solo l'IP, valido 14/07/2026 → 11/07/2036. Non copre `dev.bsg.it`: qualunque client che verifica i certificati fallisce sia per root non fidata sia per hostname assente |
| HTTP porta 80 | Risponde `200` senza redirect verso HTTPS |
| Restrizione accessi | Firewall dell'istanza Lightsail (confermato dall'utente). Non Wordfence, non `.htaccess` |
| wp-admin | Nessun 2FA attivo |
| Core e stack | WordPress 7.1, Elementor 4.2.4 + Elementor Pro, MetForm 4.3.0, tema `most`, AIOSEO 5.0.1.1 |
| Posta | Nessun mailer configurato. `wp_mail()` fallisce; il form mostra *"Something went wrong. Please setup your SMTP mail server."* WP Mail SMTP registra comunque il tentativo nel Registro delle email |
| Pagina contatti | `/contact-us/` (non `/contatti/`, che è 404 gestita dal plugin Redirection) |

### 2.1 Plugin che influenzano i test

- `cookie-notice` + `wp-consent-api` — banner cookie, visibile al caricamento, si accetta con `#cn-accept-cookie`
- `wordpress-popup` (Hustle) — un modulo attivo sulla pagina contatti, si chiude con `.hustle-button-close`
- `ai-chat-widget` — widget di chat, radice `#ai-chat-widget-root`
- `wordfence` + `wordfence-login-security` — rate limiting e blocco IP applicativo: possono bloccare il runner
- `all-in-one-wp-migration` — indica che `dev` è con ogni probabilità un clone della produzione, quindi contiene dati personali reali
- `code-snippets` — permette di inserire hook lato server senza SSH, se in futuro servisse
- `redirection`, `mailchimp-for-wp`, `wp-job-openings`, `google-site-kit`, `wp-mail-smtp`

### 2.2 Il form di contatto

Reso da un widget Elementor di MetForm, **idratato lato client** da un'app React: l'HTML sorgente contiene `className` invece di `class` e input senza attributi, quindi i selettori esistono solo dopo il mount. I test devono attendere l'idratazione.

| Elemento | Selettore stabile |
|---|---|
| Nome | `input[name="mf-first-name"]` |
| Email | `input[name="mf-email"]` |
| Oggetto | `input[name="mf-subject"]` |
| Messaggio | `textarea[name="mf-textarea"]` |
| Consenso GDPR (obbligatorio) | `input[name="mf-gdpr-consent"]` |
| Invio | `.metform-submit-btn` (etichetta "Invia") |
| Token captcha | `#g-recaptcha-response` |

Gli attributi `id` sono generati con suffissi casuali (`mf-input-text-184663a1`) e cambiano al risalvataggio del form: **non vanno usati come selettori**. Nessun campo porta l'attributo HTML `required`: la validazione è JS e server-side, quindi i test devono attendere i messaggi di MetForm e non affidarsi alla validazione nativa del browser.

L'endpoint di invio sta sotto il namespace REST `metform/v1/entries`.

### 2.3 reCAPTCHA

È **v2 a rendering esplicito**: `api.js?render=explicit`, `grecaptcha.render()`, iframe `api2/anchor` (la casella) e `api2/bframe` (la sfida). La stessa site key è usata da MetForm e da Hustle, configurate separatamente.

### 2.4 Difetto preesistente da conoscere

La pagina contatti emette **un errore in console a ogni caricamento**, prima di qualunque aggiornamento:

```
Error: reCAPTCHA has already been rendered in this element
  at metform/build/frontend/app/index.js ... renderReCaptcha ... window.onload
```

MetForm chiama `renderReCaptcha` due volte, a idratazione e di nuovo a `window.onload`; la seconda passata trova l'elemento già occupato. **Verificato che il widget dei contatti è comunque renderizzato e funzionante** (iframe `anchor` presente e visibile); il div vuoto appartiene a Hustle, che monta il proprio captcha all'apertura del popup. È un difetto di idempotenza di MetForm, senza effetto sul form.

Questo fatto è la ragione della decisione D6.

---

## 3. Decisioni architetturali

### D1 — Il trigger è manuale (`workflow_dispatch`)

Gli aggiornamenti restano manuali; i test si lanciano a mano dopo averli fatti. Il workflow espone un campo di input testuale libero (*"cosa hai aggiornato"*) che finisce nel titolo del run e nel report, così lo storico resta leggibile a mesi di distanza.

`workflow_dispatch`, `schedule` e `repository_dispatch` convivono nello stesso file: passare in futuro al controllo notturno o a un hook WordPress è un'aggiunta di poche righe, non una riprogettazione.

**Conseguenza accettata:** il rollback resta manuale (vedi D10), perché quando la CI entra in scena l'aggiornamento è già avvenuto.

### D2 — Runner GitHub-hosted, non self-hosted sull'istanza

Un runner sulla Lightsail eviterebbe il problema dell'allowlist, ma i test competerebbero con WordPress e MySQL per RAM e CPU, e misurare il sito dalla macchina che lo serve falsa i risultati. I runner GitHub-hosted non aggiungono carico allo staging.

### D3 — Accesso via allowlist dinamica del firewall Lightsail, con read-modify-restore

Il runner assume un ruolo AWS via **OIDC** (nessuna chiave statica in GitHub), aggiunge il proprio IP alla lista consentita sulla 443, esegue i test, e ripristina lo stato iniziale.

**Il pattern è obbligatoriamente read-modify-restore:**

1. `lightsail:GetInstancePortStates` — leggi i CIDR attualmente consentiti
2. `lightsail:OpenInstancePublicPorts` — riscrivi la 443 con i CIDR originali **più** l'IP del runner
3. esegui i test
4. `lightsail:OpenInstancePublicPorts` — riscrivi la 443 con **esattamente** l'insieme originale, in uno step `if: always()`

Se lo stato originale prevedeva la 443 completamente chiusa, il ripristino usa invece `lightsail:CloseInstancePublicPorts`: è la ragione per cui quell'azione compare nella policy IAM di §8 pur non essendo usata nel percorso normale.

L'API `PutInstancePublicPorts` **chiude tutte le porte non elencate nella richiesta** e cancellerebbe l'allowlist dell'ufficio, chiudendo fuori l'utente dal proprio sito. Per questo la policy IAM **non concede** `lightsail:PutInstancePublicPorts`: il workflow non deve avere la capacità fisica di provocare quel danno.

Il ripristino si basa **esclusivamente** sullo stato letto al passo 1 e salvato per la durata del run: nessuna lista di riferimento è committata nel repo. Vedi il rischio accettato in §8.

Nota da verificare al primo run: si assume che `OpenInstancePublicPorts` sovrascriva la lista CIDR della sola porta indicata, lasciando intatte le altre porte.

### D4 — I test girano su HTTPS con `ignoreHTTPSErrors`, mai su HTTP

La porta 80 risponde e sarebbe la scorciatoia ovvia per aggirare il certificato self-signed, **ma falsa il test**: i font Poppins di Elementor sono referenziati con URL assoluti `https://`, quindi caricando la pagina in `http://` finiscono cross-origin, CORS li blocca e i font non caricano. Si collauderebbe una pagina che nessun visitatore vede, con dieci errori in console inesistenti nella realtà.

Quindi: `baseURL: https://dev.bsg.it`, `ignoreHTTPSErrors: true` nella config Playwright.

**Costo accettato, e permanente:** la suite è cieca ai problemi TLS veri. Sarebbe stato rimosso installando un certificato Let's Encrypt, ma l'utente ha deciso l'08/09/2026 di non farlo (§12). Quindi questa riga non è provvisoria: resta.

### D5 — Smoke test dichiarativo con invarianti strutturali, non visual regression

Gli URL da controllare e i selettori attesi stanno in un file di dati (`targets.json`); un unico test generico ci cicla sopra. Aggiungere una pagina è una riga di JSON.

Il confronto a pixel è **escluso**: banner cookie, popup, caroselli, lazy-load e font generano falsi positivi continui, le baseline devono essere prodotte sullo stesso OS del runner, e ogni modifica legittima di design richiede di riapprovarle. Una suite che sta rossa per motivi ingiustificati smette di essere guardata, e allora non serve a niente.

Al suo posto, **invarianti strutturali**: il CSS è realmente applicato (si legge una computed style, non solo l'HTTP 200 del foglio), le immagini critiche sono decodificate (`naturalWidth > 0`), non c'è overflow orizzontale, header, nav, main e footer esistono. Questo intercetta il guasto realistico — un foglio di stile in 404, un plugin che svuota una sezione — senza una sola baseline da mantenere.

**L'esclusione è stata riaperta e poi riconfermata l'08/09/2026.** La domanda dell'utente era legittima — così com'è, la suite non si accorge se un aggiornamento *sposta* qualcosa — e il confronto visivo su pochi elementi è stato provato per davvero. Poi l'utente ha deciso di non tenerlo. Il resoconto del tentativo, con ciò che ha funzionato e ciò che no, è in D14: serve a non ripartire da zero se un giorno si riprova.

### D6 — Gli errori in console sono baselinati, non azzerati

Il sito emette già un errore a riposo (§2.4). Un'asserzione "zero errori" sarebbe rossa dal primo run e verrebbe disattivata entro una settimana.

`targets.json` contiene quindi una lista di **firme d'errore note e accettate**; il test falla solo su errori **nuovi**. Inoltre l'asserzione è **limitata al primo dominio**: si fallisce solo su errori originati da `dev.bsg.it`, ignorando il rumore di Site Kit, reCAPTCHA e del chat widget.

Ogni voce della lista di errori accettati porta una nota che spiega perché è accettata, così la lista non diventa un tappeto sotto cui nascondere le regressioni.

### D7 — Nessun accesso a wp-admin

I test restano interamente sulla parte pubblica. Tre ragioni:

- nessuna credenziale WordPress nei GitHub Secrets, il che conta doppio con un canale TLS non autenticato (D4)
- leggere liste di entry o log dall'interfaccia di wp-admin significa dipendere dal markup di un plugin, che cambia proprio quando lo si aggiorna: sarebbe una suite anti-regressione che si rompe da sola agli aggiornamenti
- si può aggiungere in seguito senza riprogettare

Se in futuro servisse leggere le entry, la strada è una **Application Password** in Basic Auth sulle REST API lette con `request.get()` — non un login da browser.

### D8 — Il form è verificato fino alla risposta REST

Il test compila i campi, spunta il consenso GDPR, supera il captcha, invia, e intercetta la risposta della chiamata a `metform/v1/entries`.

Una risposta **2xx** prova in un colpo che: il widget Elementor si è idratato, i campi esistono ancora con quei `name`, la validazione è passata, il token captcha è stato verificato lato server, e l'handler REST ha accettato la submission. Sono esattamente i guasti prodotti da un aggiornamento di Elementor, Elementor Pro o MetForm.

**Non si asserisce nulla sul testo mostrato in pagina** — né la conferma, che oggi non arriva mai per la posta non configurata, né il messaggio d'errore, che sparirebbe il giorno in cui un mailer venisse configurato, rendendo rossa la suite per aver funzionato. Il principio è: **asserire solo ciò che è invariante rispetto allo stato dell'SMTP.**

Ogni invio porta un **run-ID univoco** nel corpo del messaggio, così le submission di test sono riconoscibili a mano in MetForm → Entries.

### D9 — Il test di invio del form: provato, misurato, abbandonato

**Decisione finale: non esiste un test che invia il form.** L'idea era configurare su dev le chiavi reCAPTCHA di test di Google, che rendono sempre valida la verifica, così da poter inviare davvero. È stata realizzata e messa alla prova il 09/09/2026. Non funziona, e le misure spiegano perché.

**Cosa abbiamo trovato, in ordine.**

Il consenso GDPR non era cliccabile: l'`input` ha `display:none` e sta dentro un `<label>`. Risolto cliccando l'etichetta, con il click spostato a sinistra perché al centro c'è il link alla privacy policy.

Il widget captcha nasce disabilitato mentre si inizializza, e MetForm chiama `renderReCaptcha` **due volte** — a idratazione e a `window.onload`, che scatta proprio quando `goto()` ritorna. Cliccare in quella finestra significa cliccare un widget che sta per essere ricreato.

Il ciclo di ritentativi introdotto per aggirarlo **peggiorava** la situazione: cliccare ripetutamente un reCAPTCHA lo manda in blocco permanente. Passaggio da 40% a 60% di successo attendendo la stabilità e cliccando una volta sola — comunque inaccettabile.

Scrivere il token direttamente nei campi non funziona: **0 su 5**. MetForm lo legge da `grecaptcha.getResponse()`, lo trova vuoto e blocca l'invio lato client. La POST non parte nemmeno.

**La causa vera:** le chiavi di test rendono sempre positiva la verifica **lato server**, non rendono il widget meno sospettoso dell'automazione. reCAPTCHA v2 fa da sé rilevamento del browser pilotato, e accetta il click in modo imprevedibile. Un test instabile è peggio di nessun test.

**Cosa è stato messo al suo posto**, e vale più di quanto si è perso. Una diagnosi separata ha stabilito che a widget non disturbato l'inizializzazione riesce sistematicamente (11 caricamenti su 11), quindi due asserzioni deterministiche sono possibili e coprono i due modi in cui il form diventa **inutilizzabile per i clienti restando all'apparenza normale**:

- il **consenso GDPR è spuntabile da un utente** — se una regressione CSS nascondesse l'etichetta, nessuno potrebbe più inviare
- il **widget reCAPTCHA si carica e diventa utilizzabile** — se restasse bloccato in caricamento, il server rifiuterebbe ogni invio per token assente, e il visitatore non capirebbe perché

**Conseguenze pratiche:** le chiavi di test su dev non servono più e vanno rimesse quelle reali, perché nel frattempo indeboliscono lo staging. La variabile `RECAPTCHA_TEST_KEYS` e `RUN_ID` sono state rimosse da workflow e documentazione: non le legge più nessuno.

**Lo scambio è stato posto all'utente ed è stato deciso.** Esiste una strada per avere un test di invio deterministico: **togliere il reCAPTCHA dal form su dev**. Ma è uno scambio, non un guadagno: si perderebbe l'asserzione che il captcha si inizializzi, e un captcha bloccato rende il form inutilizzabile per *tutti* i visitatori mentre il sito sembra normale. Copertura sul captcha oppure sull'invio, non entrambe. **Il 09/09/2026 l'utente ha scelto di tenere il captcha**, perché è l'integrazione più fragile delle due — ha già il difetto di doppio rendering documentato in §2.4. Non riaprire la questione senza un motivo nuovo.

### D10 — Rollback manuale via snapshot Lightsail

Lo snapshot va creato **prima** dell'aggiornamento, a mano, perché con trigger manuale la CI entra in scena quando il danno è già fatto.

**Dettaglio operativo critico:** su Lightsail il ripristino di uno snapshot **non sovrascrive l'istanza esistente**. Crea una *nuova* istanza dallo snapshot; l'IP statico va poi spostato sulla nuova e la vecchia dismessa. Chi non lo sa lo scopre nel momento peggiore.

Per un singolo plugin andato male la via corta è reinstallare la versione precedente, non il ripristino completo, che è il rimedio per il core rotto.

**La procedura completa, se si arriva al ripristino da snapshot:**

1. `aws lightsail create-instances-from-snapshot` — crea la nuova istanza
2. attendi che sia `running`
3. **sposta l'IP statico** dalla vecchia alla nuova: Lightsail → Networking → l'IP statico → Attach to instance
4. verifica che `https://dev.bsg.it` risponda dalla nuova
5. **riapplica a mano la restrizione IP nel firewall**: la nuova istanza nasce con le regole di default, quindi l'allowlist non c'è. Conviene fotografare le regole **prima** del ripristino, con `aws lightsail get-instance-port-states --instance-name VECCHIA` oppure con uno screenshot della console
6. solo dopo aver verificato tutto, dismetti la vecchia istanza

Il passo 5 è quello che si dimentica, e senza di esso la nuova istanza resta esposta a Internet o inaccessibile, a seconda dei default.

*Nota del 09/09/2026:* questa procedura stava in `docs/ROLLBACK.md`, che l'utente ha chiesto di eliminare. È stata riportata qui perché il passo 5 non era documentato in nessun altro punto e senza di esso il ripristino si conclude male.

### D11 — Su dev non si configura alcun mailer

Scelta dell'utente. Uno staging che sa scrivere ai clienti veri è un incidente in attesa, e non gli si restituisce la voce.

**Conseguenza sulla copertura, da tenere presente:** combinata con D7, la suite **non verifica che la notifica email venga ancora generata**. Verifica che il form accetti ancora le submission. Per coprire anche la generazione della notifica servirebbe leggere il Registro delle email di WP Mail SMTP, che richiede l'accesso escluso da D7. È un'evoluzione possibile (§13), non una dimenticanza.

### D12 — Il sistema resta indipendente dalla macchina

**Vincolo richiesto esplicitamente, non proprietà emergente.** Il sistema di test non installa nulla sull'istanza Lightsail, non vi esegue codice, non vi accede via SSH e non entra in wp-admin. Interroga il sito dall'esterno via HTTPS, come un visitatore.

Ne segue che il design è indipendente da **com'è fatta** quella macchina: taglia dell'istanza, immagine Bitnami o no, sistema operativo, versione di PHP, layout del filesystem, presenza di WP-CLI. Nessuna di queste cose compare nel progetto, ed è il motivo per cui D2 esclude il runner self-hosted.

Punti di contatto ammessi, gli unici due:

1. **API AWS Lightsail** per il firewall (D3) — agisce sul control plane AWS, non sui contenuti della macchina
2. **Impostazioni dentro WordPress**, come le chiavi reCAPTCHA di test (D9) — configurazione applicativa, non modifica del server

Il vincolo lega **l'automazione, non l'amministrazione manuale**: che l'utente installi a mano un certificato Let's Encrypt è manutenzione sua, non il sistema di test che entra nella macchina.

Conseguenza sulla portabilità: spostando `dev.bsg.it` su un altro host, l'unica cosa da cambiare è la base URL; togliendo la restrizione IP, lo step del firewall sparisce del tutto.

Conseguenza sulle evoluzioni: ogni voce della §13 va filtrata contro questo vincolo, e due di esse sono escluse per sempre.

### D13 — L'elenco delle pagine si legge dal sitemap di dev, non si scrive a mano

`targets.json` conteneva 16 pagine scritte a mano. Il sitemap di `dev.bsg.it` ne dichiara **28**: la lista era incompleta dal primo giorno, e sarebbe andata alla deriva a ogni pagina pubblicata.

L'elenco viene quindi letto **dal sitemap del sito sotto esame**, a ogni esecuzione. Non da quello di produzione: si testa dev, quindi la lista deve descrivere dev. Verificato l'08/09/2026 che il sitemap di AIOSEO su dev è generato dinamicamente, contiene URL `dev.bsg.it`, e che tutte le 28 pagine dichiarate rispondono 200.

Sitemap inclusi: `page-sitemap` (28 URL), `post-sitemap` (35), `awsm_job_openings-sitemap` (7). **Escluso `metform-form-sitemap`** (4 URL): sono i form stessi, non pagine da visitare. Totale circa 70 URL, cinque minuti di esecuzione.

**Il sitemap è generato da un plugin, quindi due paracadute sono obbligatori:**

1. **Soglia minima.** Se il sitemap restituisce meno di `minPages` URL, il run **fallisce**. Senza questo, un aggiornamento che rompe AIOSEO renderebbe la suite verde per non aver testato niente — il fallimento peggiore possibile.
2. **Nucleo obbligatorio.** Un elenco `core` di poche pagine in `targets.json`, testate sempre, qualunque cosa dica il sitemap.

`targets.json` conserva quindi: baseline degli errori accettati, `core`, `minPages`, i sitemap da leggere, i pattern di esclusione, le aspettative di default e le deroghe per singola pagina. Smette solo di contenere l'elenco positivo.

### D14 — Confronto visivo: provato e non adottato

**Decisione finale: non si fa.** Resoconto del tentativo, perché contiene fatti utili a chi un giorno riproverà.

L'idea era fotografare **pochi elementi stabili** — testata, piè di pagina, scheda del form — invece di pagine intere, per restare fuori dal carosello e dai contenuti che cambiano. Implementato come progetto Playwright separato, con animazioni congelate, attesa del caricamento dei font, viewport fissa e una piccola tolleranza per l'antialiasing.

**Cosa ha funzionato:** tre elementi su quattro hanno dato immagini identiche fra esecuzioni consecutive al primo colpo — piè di pagina della homepage, testata di `/services/`, scheda del form di `/contact-us/`. La determinatezza c'era.

**Cosa no:** la testata della homepage. Non per una differenza di pixel, ma perché quell'elemento ha **altezza zero**: sulla homepage `.main-header` è un contenitore trasparente sovrapposto al carosello, con i figli posizionati in assoluto, quindi collassa. Playwright considera nascosto ciò che non ha un rettangolo. Andava fotografato il figlio interno (`.main-header__inner`, alto 70px), che è un lavoro di selezione da fare elemento per elemento.

**Perché è stato abbandonato:** l'utente ha deciso di non proseguire. Il costo che restava era proprio quello: un lavoro di scelta dei selettori caso per caso, più la manutenzione delle immagini a ogni modifica di design voluta, più il vincolo che il confronto vale solo sulla piattaforma che ha generato i riferimenti.

**Conseguenza sulla copertura:** resta quella dichiarata in §11 — la suite intercetta la rottura, non lo spostamento. Dopo un aggiornamento il controllo visivo del sito resta a occhio.

---

## 4. Componenti

Ogni file ha uno scopo unico ed è comprensibile senza leggere gli altri.

```
repo privato
├── targets.json                     dati: nucleo, soglia, default, deroghe, errori accettati
├── playwright.config.ts             baseURL, ignoreHTTPSErrors, retry, trace, workers
├── tests/
│   ├── lib/
│   │   ├── targets.ts               legge e valida targets.json
│   │   ├── sitemap.ts               elenco pagine dal sitemap, con soglia e nucleo
│   │   ├── collectors.ts            ascolta errori e richieste durante il caricamento
│   │   ├── console-filter.ts        decide quali errori contano
│   │   └── page-health.ts           le invarianti strutturali
│   ├── fixtures/clean-page.ts       soppressione overlay, applicata a ogni test
│   ├── unit/                        test senza browser né rete
│   └── site/
│       ├── smoke.spec.ts            un test per pagina, elenco dal sitemap
│       ├── contact-form.spec.ts     il solo flusso scriptato
│       ├── page-health.spec.ts      collaudo delle invarianti su pagine finte
│       └── clean-page.spec.ts       collaudo della fixture sul sito vero
├── scripts/
│   ├── firewall.mjs                 apre e ripristina la 443, unico punto che parla con AWS
│   └── lib/cidr-plan.mjs            calcolo puro delle regole, coperto da test
├── .github/workflows/post-update.yml   orchestrazione, nessuna logica di test
└── docs/AWS-SETUP.md                procedura IAM, da eseguire una volta sola
```

Questo è lo stato realmente costruito al 09/09/2026, non il disegno iniziale: il workflow di riconciliazione non esiste (§8), la logica del firewall sta in `scripts/` e non in una composite action, e `docs/ROLLBACK.md` è stato eliminato su richiesta dell'utente (D10).

`targets.json` è **dati, non codice**: si modifica senza toccare TypeScript. Lo script del firewall è l'unico pezzo che parla con AWS, e il calcolo delle regole è separato dalle chiamate proprio per poter essere collaudato senza conseguenze.

---

## 5. `targets.json` — struttura

```json
{
  "baseUrl": "https://dev.bsg.it",
  "acceptedConsoleErrors": [
    {
      "match": "reCAPTCHA has already been rendered in this element",
      "reason": "MetForm 4.3.0 chiama renderReCaptcha due volte; widget comunque funzionante. Verificato 08/09/2026."
    }
  ],
  "pages": [
    {
      "path": "/",
      "expect": ["header", "nav", "main", "footer"],
      "criticalImages": 1
    }
  ]
}
```

Semantica dei campi: `expect` è la lista di selettori CSS che devono esistere nella pagina; `criticalImages` è il **numero minimo** di immagini che devono risultare effettivamente decodificate (`naturalWidth > 0`), non un indice.

Pagine candidate, dai link interni della homepage: `/`, `/about-us/`, `/services/`, `/it-consulting/`, `/cyber-security/`, `/managedservices/`, `/customservices/`, `/it-training/`, `/software-development-custom-solution/`, `/sostenibilita/`, `/partner/`, `/carriere/`, `/bsg-hub/`, `/blog/`, `/contact-us/`, `/whistleblower/`.

`/cookie` e `/privacy-policy` sono linkati senza slash finale e generano un 301: le asserzioni devono tenerne conto.

---

## 6. Le asserzioni

### Livello 1 — su ogni pagina di `targets.json`

| Controllo | Guasto intercettato |
|---|---|
| Status 200, body privo di testo di errore fatale WordPress | White screen of death, fatal PHP |
| Nessun errore console nuovo, di primo dominio | Conflitto JS fra plugin |
| Nessuna richiesta di rete fallita | CSS, JS o immagini in 404 |
| Selettori di `expect` presenti | Sezione svanita |
| CSS realmente applicato (computed style) | Foglio caricato ma non attivo |
| Nessun overflow orizzontale | Layout esploso |
| Immagini critiche con `naturalWidth > 0` | Media library o CDN rotta |
| `<title>` non vuoto | Regressione SEO grossolana |

### Livello 2 — `/contact-us/`

1. Il form è idratato e i campi con i `name` di §2.2 esistono
2. Il widget reCAPTCHA è renderizzato (iframe `api2/anchor` presente)
3. Compilazione, spunta del consenso GDPR, superamento captcha, invio
4. La risposta di `metform/v1/entries` è **2xx**
5. Nessuna asserzione sul testo in pagina, né sull'esito della consegna

I punti 3 e 4 valgono **solo se** le chiavi reCAPTCHA di test vengono configurate su dev (D9, questione aperta §12.5). In caso contrario il Livello 2 si ferma ai punti 1 e 2: form idratato e widget captcha renderizzato, senza invio.

---

## 7. La fixture di soppressione overlay

Tre sorgenti di sovrapposizione intercettano i click e sono la causa più probabile di instabilità dei test su questo sito — più del captcha.

| Overlay | Trattamento |
|---|---|
| `cookie-notice` | Impostare il cookie di consenso prima del caricamento, oppure cliccare `#cn-accept-cookie`. Il nome esatto del cookie va confermato al primo run |
| Hustle (`wordpress-popup`) | Nascondere i moduli `[class*="hustle-"]`, o chiudere con `.hustle-button-close` |
| `ai-chat-widget` | Nascondere `#ai-chat-widget-root` |

Scritta una volta come fixture Playwright, si applica a tutta la suite.

---

## 8. Sicurezza

- **OIDC, non chiavi statiche.** In GitHub non vive nessuna credenziale AWS permanente
- **Policy IAM ristretta** a `GetInstancePortStates`, `OpenInstancePublicPorts` e `CloseInstancePublicPorts`. `PutInstancePublicPorts` **non concessa**, per rendere impossibile la cancellazione dell'allowlist. *Correzione dell'08/09/2026:* il disegno prevedeva di restringere la policy anche all'ARN della singola istanza, ma Lightsail ha un supporto limitato ai permessi a livello di risorsa, quindi la policy usa `"Resource": "*"` e la restrizione viene dal solo elenco delle azioni. Se l'account contiene altre istanze Lightsail va verificato se per queste azioni è disponibile una condizione basata sui tag — vedi `docs/AWS-SETUP.md`
- **Finestra di apertura minima:** solo la 443, solo l'IP del runner, solo per la durata del run
- **Chiusura in `if: always()`**, perché un test in timeout non lasci la porta aperta
- **Rischio accettato, senza rete di sicurezza automatica.** Se il runner viene ucciso di colpo — la macchina virtuale muore, il job è cancellato brutalmente — lo step `if: always()` può non eseguire e la 443 resta aperta all'IP di quel runner, che GitHub poi riassegna a un altro suo cliente. Il rischio concreto è che un utente qualunque di GitHub Actions raggiunga `dev.bsg.it`, dove `wp-login.php` risponde in chiaro su HTTP. Era previsto un workflow di riconciliazione giornaliero per coprirlo; **l'utente ha deciso l'08/09/2026 di non realizzarlo**, giudicando il rischio residuo accettabile rispetto al costo di mantenere una lista di CIDR di riferimento. Se un giorno lo si volesse, la versione da preferire è quella che si autocostruisce il riferimento leggendolo dal firewall al primo avvio, senza nulla da trascrivere a mano. Nel frattempo il controllo è manuale: `aws lightsail get-instance-port-states` dopo un run finito male
- **Repo privato**
- **Chiavi reCAPTCHA di test solo su dev** (D9)
- **Nessuna credenziale WordPress** in nessun secret (D7)
- **Rate limiting Wordfence:** `workers: 1`, User-Agent riconoscibile, quel UA in allowlist su Wordfence. Una raffica di pagine più un invio da un solo IP può altrimenti far bloccare il runner
- **`noindex` su dev.bsg.it** da verificare, per non finire indicizzato
- **Dati personali:** la presenza di All-in-One WP Migration indica che dev è probabilmente un clone della produzione, quindi contiene dati personali reali. È una questione GDPR oltre che tecnica, da confermare e valutare separatamente da questo progetto
- **wp-login in chiaro:** finché il certificato resta self-signed e HTTP resta aperto, wp-admin è raggiungibile su canale non cifrato. Il Let's Encrypt di §12 lo risolve

---

## 9. Costi

- **GitHub Actions:** un run di smoke consuma 2-3 minuti su `ubuntu-latest` (moltiplicatore 1x). Il piano Free include 2.000 minuti/mese su repo privati — da verificare sul piano in uso. Anche venti aggiornamenti al mese restano largamente nel gratuito, **a condizione di cachare i browser Playwright**: senza cache il download se ne mangia circa metà
- **Lightsail:** nessun costo aggiuntivo. Gli snapshot sono fatturati a circa 0,05 $/GB-mese, quindi conservarne uno da 40 GB è nell'ordine dei 2 $/mese. Non conservarne dieci
- **AWS API:** le chiamate Lightsail usate sono gratuite

---

## 10. Manutenzione

Il sistema è nell'ordine delle 200 righe. L'unico file toccato con regolarità è `targets.json`.

Il rischio di manutenzione non è tecnico: è che un test instabile eroda la fiducia e il report smetta di essere aperto. Tutte le scelte di questo design — poche asserzioni, deterministiche, nessuna baseline a pixel, errori noti dichiarati con la loro ragione — servono a quello.

Playwright pinnato a versione esatta; Dependabot sulle versioni delle action.

---

## 11. Limiti di copertura, dichiarati

La suite **non** verifica:

- che un invio del form venga **accettato dal server**: nessun test invia davvero, perché reCAPTCHA v2 non lo consente in modo affidabile a un browser automatizzato (D9). Si verifica che il form sia utilizzabile — campi presenti, consenso spuntabile, captcha inizializzato — non che la submission arrivi
- che la notifica email venga generata (conseguenza di D11 + D7)
- che l'entry sia persistita a database (conseguenza di D7)
- che la consegna della posta funzioni (conseguenza di D11)
- regressioni visive fini: un layout che cambia restando strutturalmente valido passa (D5)
- problemi TLS reali, **in permanenza**: `ignoreHTTPSErrors` non verrà rimosso, perché il certificato non si installa (D4, §12)
- i form di `/carriere/` (wp-job-openings) e `/whistleblower/`, che restano fuori dalla v1
- performance, accessibilità, SEO oltre la presenza del `<title>`

---

## 12. Questioni aperte

**Non ne restano di bloccanti.** Risolte tutte il 09/09/2026:

| Questione | Risposta |
|---|---|
| Istanza Lightsail e regione | `bsg-website-dev`, `eu-central-1` (Frankfurt) |
| Repo GitHub | `gsabia-bsg/dev-post-update-tests`, privato |
| Ruolo IAM | Creato: provider OIDC, policy `dev-bsg-firewall-ci`, ruolo `dev-bsg-firewall-ci-role` |
| Chiavi reCAPTCHA di test | Non servono più, vedi D9. Su dev vanno rimesse quelle reali |

Resta solo da eseguire: mettere `AWS_ROLE_ARN` fra i secret del repo e le due variabili `LIGHTSAIL_INSTANCE_NAME` e `AWS_REGION`, poi lanciare il workflow una prima volta e verificare a mano che il firewall torni allo stato iniziale.

Chiuse l'08/09/2026:

- ~~CIDR di riferimento del firewall~~ — non più necessari: il workflow di riconciliazione non si realizza, vedi il rischio accettato in §8
- ~~Lista definitiva degli URL~~ — non si scrive più a mano: si legge dal sitemap di dev a ogni esecuzione, vedi D13
- ~~Certificato Let's Encrypt su `dev.bsg.it`~~ — **l'utente ha deciso di non installarlo.** Due conseguenze passano da temporanee a permanenti. Primo: `ignoreHTTPSErrors` resta per sempre nella configurazione, quindi la suite non vedrà mai un problema TLS reale (§11). Secondo: `wp-login.php` resta raggiungibile su canale non cifrato, e questo rende **sconsigliabile** l'evoluzione con Application Password della §13, perché manderebbe una credenziale WordPress in chiaro attraverso Internet a ogni esecuzione

Raccomandato, non bloccante:

5. **Includere i form di `/carriere/` e `/whistleblower/`**? Le pagine sono già nello smoke, i loro form no. Il secondo è rilevante anche in senso normativo
6. **Notifiche su Teams**: GitHub invia già un'email sui workflow falliti. Un canale in più ha senso solo se si scopre di ignorare quell'email

---

## 13. Evoluzioni previste, fuori dalla v1

Tutte aggiungibili senza riprogettare, ma **filtrate contro il vincolo di indipendenza D12**.

### Compatibili con D12

**Trigger automatico senza codice sul server.** Un job `schedule` notturno può rilevare gli aggiornamenti **leggendo l'HTML pubblico**, senza alcun accesso alla macchina: WordPress ed Elementor espongono la versione nei meta `generator`, e i plugin la espongono nei parametri `?ver=` degli asset. Sono già osservabili dall'esterno la versione del core, di Elementor, di MetForm e di AIOSEO. Il job confronta le versioni lette con un manifest committato nel repo, esegue la suite se qualcosa è cambiato, e aggiorna il manifest. Questa è la strada corretta per automatizzare il trigger, e sostituisce l'idea dell'hook `upgrader_process_complete`.

**Verifica della persistenza delle entry — ora sconsigliata.** Una **Application Password** di WordPress in Basic Auth sulle REST API, letta con `request.get()` senza aprire il browser, rispetterebbe D12 perché è configurazione applicativa e non modifica del server. Ma avrebbe senso solo su un canale cifrato e autenticato, e il certificato non si installa (§12): manderebbe una credenziale WordPress in chiaro attraverso Internet a ogni esecuzione. Resta praticabile solo se un giorno il certificato verrà messo.

**Sink di posta esterno.** Puntare WP Mail SMTP a una casella-trappola esterna è un'impostazione dentro WordPress: rispetta D12 e chiuderebbe l'anello della consegna. È la sola strada compatibile per ottenere copertura sulle email.

**Rimozione di `ignoreHTTPSErrors`** dopo l'installazione manuale del certificato.

**Visual regression**, solo se un guasto reale sfuggito alle invarianti strutturali ne dimostrerà la necessità.

### Escluse da D12

**Hook `upgrader_process_complete` che chiama `repository_dispatch`.** Richiede un mu-plugin o uno snippet sul server, più un token GitHub ospitato lì. Sostituita dal rilevamento versioni via HTML pubblico descritto sopra.

**Mailpit sull'istanza.** Richiede l'installazione di un binario e di un servizio sulla macchina. Se servirà copertura sulla posta, si usa il sink esterno.
