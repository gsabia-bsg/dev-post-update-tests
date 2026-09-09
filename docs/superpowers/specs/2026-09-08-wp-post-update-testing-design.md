# Test automatizzati post-aggiornamento — dev.bsg.it

**Prima stesura:** 8 settembre 2026 · **Ultima revisione:** 9 settembre 2026
**Stato:** realizzato e in funzione
**Ambito:** solo `dev.bsg.it` (staging). La produzione non è toccata da questo sistema.

---

## 1. Obiettivo

Dopo ogni aggiornamento manuale di WordPress, di un plugin o del tema su `dev.bsg.it`,
poter verificare in pochi minuti — premendo un pulsante — che il sito non si sia rotto,
con una diagnosi utilizzabile quando qualcosa fallisce.

**Fuori ambito, deliberatamente:**

- eseguire gli aggiornamenti: restano manuali, da wp-admin
- riparare o annullare un aggiornamento: la suite segnala, non interviene
- testare la produzione
- monitoraggio continuo o uptime check

---

## 2. Stato dell'ambiente

Fatti verificati direttamente, che hanno determinato le decisioni della sezione 3.
Vanno riverificati se l'ambiente cambia.

| Aspetto | Rilevazione |
|---|---|
| Hosting | AWS Lightsail, istanza `bsg-website-dev` in `eu-central-1`, IP statico `3.73.112.45` |
| Certificato TLS | Self-signed, `CN=3.73.112.45`, SAN contiene solo l'IP. Non copre `dev.bsg.it`: qualunque client che verifica i certificati fallisce sia per root non fidata sia per hostname assente |
| HTTP porta 80 | Risponde `200` senza redirect verso HTTPS |
| Restrizione accessi | Firewall dell'istanza Lightsail. Su IPv4 passa un solo indirizzo; su IPv6 le porte 80 e 443 erano aperte a tutti, ma nessun record AAAA è pubblicato per il nome |
| wp-admin | Nessun 2FA attivo, e `wp-login.php` risponde in chiaro su HTTP |
| Core e stack | WordPress 7.1, Elementor 4.2.4 + Elementor Pro, MetForm 4.3.0, tema `most`, AIOSEO 5.0.1.1 |
| Indicizzazione | **Nessun `noindex`**: il `robots.txt` blocca solo `/wp-admin/` e il meta robots dice soltanto `max-image-preview:large`. Lo staging è liberamente indicizzabile, con i contenuti duplicati della produzione |
| Posta | Nessun mailer configurato: `wp_mail()` fallisce e il form mostra un errore SMTP |
| Pagina contatti | `/contact-us/` |

### 2.1 Plugin che influenzano i test

- `cookie-notice` + `wp-consent-api` — banner cookie, visibile al caricamento, si accetta con `#cn-accept-cookie`
- `wordpress-popup` (Hustle) — un modulo attivo sulla pagina contatti, si chiude con `.hustle-button-close`
- `ai-chat-widget` — widget di chat, radice `#ai-chat-widget-root`
- `wordfence` + `wordfence-login-security` — rate limiting e blocco IP applicativo: possono bloccare il runner
- `all-in-one-wp-migration` — indica che `dev` è con ogni probabilità un clone della produzione, quindi contiene dati personali reali
- `code-snippets` — permette di inserire hook lato server senza SSH, se in futuro servisse
- `redirection`, `mailchimp-for-wp`, `wp-job-openings`, `google-site-kit`, `wp-mail-smtp`

### 2.2 Il form di contatto

Reso da un widget Elementor di MetForm, **idratato lato client** da un'app React: l'HTML
sorgente contiene `className` invece di `class` e input senza attributi, quindi i selettori
esistono solo dopo il mount. I test devono attendere l'idratazione.

| Elemento | Selettore stabile |
|---|---|
| Nome | `input[name="mf-first-name"]` |
| Email | `input[name="mf-email"]` |
| Oggetto | `input[name="mf-subject"]` |
| Messaggio | `textarea[name="mf-textarea"]` |
| Consenso GDPR (obbligatorio) | `input[name="mf-gdpr-consent"]` |
| Invio | `.metform-submit-btn` (etichetta "Invia") |

Gli attributi `id` sono generati con suffissi casuali (`mf-input-text-184663a1`) e cambiano
al risalvataggio del form: **non vanno usati come selettori**. I `name` invece sono stabili.

Nessun campo porta l'attributo HTML `required`: la validazione è JS e server-side, quindi i
test devono attendere i messaggi di MetForm e non fidarsi della validazione nativa del
browser. Il consenso GDPR ha l'`input` con `display:none` dentro un `<label>`: è l'etichetta
che l'utente clicca, e il click va spostato a sinistra perché al centro c'è il link alla
privacy policy.

L'endpoint di invio sta sotto il namespace REST `metform/v1/entries`.

### 2.3 Difetti preesistenti del sito

Rilevati dalla suite al primo controllo, prima di qualunque aggiornamento. Sono dichiarati
come deroghe motivate in `targets.json`, non silenziati, e ogni deroga dice quando va tolta.

| Pagina | Difetto |
|---|---|
| `/cyber-security/` | Circa 139px di overflow orizzontale. Causa individuata: un titolo `<h6>` (widget Elementor `9f7f359`) spostato di 200px a destra da un Motion Effect, dentro il contenitore `d29491c`. Produce una barra di scorrimento laterale su desktop |
| `/job-openings/` | Eccezione JavaScript `elementorFrontendConfig is not defined`: la pagina è generata dal template di `wp-job-openings` e non da Elementor, quindi la configurazione di Elementor non viene accodata, ma qualcosa prova a usarla comunque |

---

## 3. Decisioni architetturali

### D1 — Il trigger è manuale (`workflow_dispatch`)

Gli aggiornamenti restano manuali; i test si lanciano a mano dopo averli fatti. Il workflow
espone un campo di input testuale libero (*"cosa hai aggiornato"*) che finisce nel titolo del
run, così lo storico resta leggibile a mesi di distanza.

`workflow_dispatch`, `schedule` e `repository_dispatch` convivono nello stesso file: passare
in futuro al controllo notturno o a un hook WordPress è un'aggiunta di poche righe.

**Conseguenza accettata:** quando la CI entra in scena l'aggiornamento è già avvenuto, quindi
la suite può soltanto segnalare, non prevenire.

### D2 — Runner GitHub-hosted, non self-hosted sull'istanza

Un runner sulla Lightsail eviterebbe il problema dell'allowlist, ma i test competerebbero con
WordPress e MySQL per RAM e CPU, e misurare il sito dalla macchina che lo serve falsa i
risultati. I runner GitHub-hosted non aggiungono carico allo staging.

### D3 — Accesso via allowlist dinamica del firewall Lightsail

Il runner assume un ruolo AWS via **OIDC** (nessuna chiave statica in GitHub), aggiunge il
proprio IP alla lista consentita sulla 443, esegue i test, e rimuove ciò che ha aggiunto.

**La sequenza:**

1. `GetInstancePortStates` — leggi i CIDR consentiti, e **salva anche il CIDR che stai per aggiungere**
2. `OpenInstancePublicPorts` — aggiungi l'IP del runner alla 443
3. esegui i test
4. `CloseInstancePublicPorts` — **rimuovi esattamente il CIDR aggiunto**, in uno step `if: always()`
5. `GetInstancePortStates` di nuovo — **verifica** che il CIDR del runner sia sparito e che quelli originali ci siano ancora. Se non è così, fallisci rumorosamente

**La semantica delle due API, verificata sul campo:** `Open` **aggiunge** i CIDR indicati, non
sostituisce la lista. `Close` **rimuove**. Sono complementari, e insieme raggiungono qualunque
stato. Lightsail tiene inoltre IPv4 e IPv6 in due campi separati, `cidrs` e `ipv6Cidrs`:
vanno riportati entrambi.

L'API `PutInstancePublicPorts` **chiude tutte le porte non elencate nella richiesta** e
cancellerebbe l'allowlist dell'ufficio. Per questo la policy IAM **non la concede**: il
workflow non deve avere la capacità fisica di provocare quel danno.

Il ripristino si basa esclusivamente sullo stato letto al passo 1 e salvato per la durata del
run: nessuna lista di riferimento è committata nel repo.

#### L'incidente del primo run, e cosa ci ha insegnato

Il primo run in CI ha **lasciato l'IP del runner consentito sulla 443**. La porta è rimasta
aperta a un indirizzo che GitHub riassegna ad altri suoi clienti. È emerso da un controllo
manuale della console: il sistema non se n'era accorto.

**La causa.** Il ripristino chiamava `Open` con la lista originale, credendo di sovrascrivere.
Ma `Open` è additiva: riscrivere la lista originale non toglieva nulla. Il ripristino era
un'operazione a vuoto, e dichiarava successo.

**La causa della causa, che è quella che conta.** In questa spec era scritto *"si assume che
Open sovrascriva; da verificare al primo run"*. Dopo il primo run quella riga è stata cambiata
in *"verificato: Open sovrascrive"* — **senza che nessuna verifica fosse stata fatta.** Un'
assunzione è stata promossa a fatto accertato perché il run era verde, e il verde veniva da un
ripristino che non ripristinava.

Da qui due regole, che valgono oltre questo progetto:

- **Non scrivere "verificato" se non hai guardato.** Un'ipotesi etichettata come fatto è
  peggio di un'ipotesi dichiarata: la seconda invita al controllo, la prima lo chiude.
- **Un'operazione che promette di ripristinare uno stato deve rileggere lo stato e
  confrontarlo.** Il codice ora lo fa, e fallisce rumorosamente se il confronto non torna —
  compreso il caso opposto, in cui la chiusura porti via anche i CIDR legittimi e chiuda
  l'utente fuori dal proprio sito.

#### Il tranello dell'identità OIDC

Costato un'ora, e da tenere se un giorno il ruolo va ricreato.

Creando un ruolo *Web identity* per GitHub, la console AWS genera una condizione sul subject
del token in questa forma:

```
repo:gsabia-bsg/dev-post-update-tests:*
```

Ma GitHub emette un subject con gli **identificativi numerici** di utente e repository
attaccati con la `@`:

```
repo:gsabia-bsg@261906451/dev-post-update-tests@1361551299:ref:refs/heads/main
```

È il formato a identificatori immutabili: impedisce che qualcuno cancelli un repository e ne
crei un altro con lo stesso nome per impersonarlo. Con la condizione generata dalla console le
due stringhe non combaciano, e AWS rifiuta. La condizione corretta è quindi:

```
"token.actions.githubusercontent.com:sub":
  "repo:gsabia-bsg@261906451/dev-post-update-tests@1361551299:*"
```

**Perché è stato difficile da trovare.** AWS risponde `Not authorized to perform
sts:AssumeRoleWithWebIdentity` **sia** quando i permessi mancano **sia** quando il subject non
combacia — due cause opposte, un solo messaggio. E nel secondo caso **non scrive nulla in
CloudTrail**, in nessuna regione: manca perfino il rifiuto da leggere. Tutto ciò che si può
ispezionare — provider, audience, policy, ruolo, ARN — risulta corretto, e questo fa sospettare
un divieto a livello di organizzazione, cioè qualcosa fuori dalla propria portata.

**Come si diagnostica.** Stampando i claim del token dal workflow, in uno step che precede la
chiamata ad AWS: è l'unico modo di vedere cosa GitHub manda davvero, invece di continuare a
verificare cosa AWS si aspetta. Lo step usato allora sta nella cronologia del repository,
commit `399ab85`.

### D4 — I test girano su HTTPS con `ignoreHTTPSErrors`, mai su HTTP

La porta 80 risponde e sarebbe la scorciatoia ovvia per aggirare il certificato self-signed,
**ma falsa il test**: i font Poppins di Elementor sono referenziati con URL assoluti `https://`,
quindi caricando la pagina in `http://` finiscono cross-origin, CORS li blocca e i font non
caricano. Si collauderebbe una pagina che nessun visitatore vede.

Quindi: `baseURL: https://dev.bsg.it`, `ignoreHTTPSErrors: true` nella config Playwright.

**Costo accettato, e permanente:** la suite è cieca ai problemi TLS veri. Un certificato
Let's Encrypt lo eliminerebbe, ma su `dev.bsg.it` il certificato self-signed resta per scelta di
progetto. Questa riga non è provvisoria.

### D5 — Smoke test dichiarativo con invarianti strutturali, non visual regression

Le regole stanno in un file di dati (`targets.json`) e un unico test generico ci cicla sopra.

Il confronto a pixel è **escluso**: banner cookie, popup, caroselli, lazy-load e font generano
falsi positivi continui, le baseline devono essere prodotte sullo stesso OS del runner, e ogni
modifica legittima di design richiede di riapprovarle. Una suite che sta rossa per motivi
ingiustificati smette di essere guardata, e allora non serve a niente.

Al suo posto, **invarianti strutturali**: il CSS è realmente applicato (si legge lo stato dei
fogli di stile, non solo l'HTTP 200), le immagini critiche sono decodificate
(`naturalWidth > 0`), non c'è overflow orizzontale, header, nav, main e footer esistono. Questo
intercetta il guasto realistico — un foglio di stile in 404, un plugin che svuota una sezione —
senza una sola baseline da mantenere.

La soglia di overflow mira al layout catastroficamente rotto, non a pochi pixel: il carosello in
homepage oscilla di suo. Le pagine con un difetto preesistente hanno una deroga motivata (§2.3).

### D6 — Gli errori in console sono baselinati, non azzerati

Il sito emette già errori a riposo — per esempio l'eccezione JavaScript su `/job-openings/`
descritta in §2.3. Un'asserzione "zero errori" sarebbe rossa dal primo run e verrebbe
disattivata entro una settimana.

`targets.json` contiene quindi una lista di **firme d'errore note e accettate**; il test falla
solo su errori **nuovi**. Le eccezioni possono essere globali o dichiarate su una **singola
pagina**, e la forma stretta è preferibile: se lo stesso errore comparisse altrove, lo si
vedrebbe.

Inoltre l'asserzione è **limitata al primo dominio**: si fallisce solo su errori originati da
`dev.bsg.it`, ignorando il rumore delle terze parti.

Ogni voce porta una nota che spiega perché è accettata — il validatore la **esige** — così la
lista non diventa un tappeto sotto cui nascondere le regressioni.

### D7 — Nessun accesso a wp-admin

I test restano interamente sulla parte pubblica. Tre ragioni:

- nessuna credenziale WordPress nei GitHub Secrets, il che conta doppio con un canale TLS non
  autenticato (D4)
- leggere liste di entry o log dall'interfaccia di wp-admin significa dipendere dal markup di
  un plugin, che cambia proprio quando lo si aggiorna: sarebbe una suite anti-regressione che
  si rompe da sola agli aggiornamenti
- si può aggiungere in seguito senza riprogettare

### D8 — Il form si verifica per usabilità, non per invio

Non esiste un test che invii il form. Un browser automatizzato non riesce a superare in modo
affidabile la verifica anti-bot presente sulla pagina, e un test instabile è peggio di nessun
test: fallendo a intermittenza per un motivo estraneo al sito, erode la fiducia in tutti gli
altri.

Si asserisce quindi soltanto ciò che è deterministico — e che copre comunque i due modi in cui
il form diventa **inutilizzabile per i clienti restando all'apparenza normale**:

1. **il form è idratato** e i campi con i `name` di §2.2 esistono
2. **il consenso GDPR è spuntabile da un utente** — se una regressione CSS ne nascondesse
   l'etichetta, nessuno potrebbe più inviare
3. **il widget di verifica anti-bot si carica e diventa utilizzabile** — se restasse bloccato
   in caricamento, il server rifiuterebbe ogni invio per token assente, e il visitatore non
   capirebbe perché

Verificato che a widget non disturbato l'inizializzazione riesce sistematicamente, 11
caricamenti su 11, quindi la terza asserzione è stabile.

**Non si asserisce nulla sul testo mostrato in pagina.** Oggi il form mostra sempre un errore
SMTP perché la posta non è configurata; asserire quel messaggio significherebbe scrivere il
difetto dentro il test, e il giorno in cui un mailer venisse configurato la suite diventerebbe
rossa per aver funzionato. Il principio è: **asserire solo ciò che è invariante rispetto allo
stato dell'SMTP.**

### D9 — Su dev non si configura alcun mailer

Uno staging che sa scrivere ai clienti veri è un incidente in attesa, e non gli si restituisce
la voce.

**Conseguenza sulla copertura:** combinata con D7, la suite **non verifica che la notifica email
venga generata**. Verifica che il form sia utilizzabile. Per coprire anche la generazione della
notifica servirebbe leggere il registro delle email, che richiede l'accesso escluso da D7.

### D10 — Il sistema resta indipendente dalla macchina

**Vincolo di progetto, non proprietà emergente.** Il sistema di test non installa
nulla sull'istanza Lightsail, non vi esegue codice, non vi accede via SSH e non entra in
wp-admin. Interroga il sito dall'esterno via HTTPS, come un visitatore.

Ne segue che il design è indipendente da **com'è fatta** quella macchina: taglia dell'istanza,
immagine, sistema operativo, versione di PHP, presenza di WP-CLI. Nessuna di queste cose compare
nel progetto, ed è il motivo per cui D2 esclude il runner self-hosted.

Punti di contatto ammessi, gli unici due:

1. **API AWS Lightsail** per il firewall (D3) — agisce sul control plane AWS, non sui contenuti
   della macchina
2. **Impostazioni dentro WordPress**, se un giorno servissero — configurazione applicativa, non
   modifica del server

Il vincolo lega **l'automazione, non l'amministrazione manuale**: che l'utente installi a mano
un certificato è manutenzione sua.

Conseguenza sulla portabilità: spostando `dev.bsg.it` su un altro host, l'unica cosa da cambiare
è la base URL; togliendo la restrizione IP, lo step del firewall sparisce del tutto.

### D11 — L'elenco delle pagine si legge dal sitemap di dev

`targets.json` conteneva 16 pagine scritte a mano. Il sitemap di `dev.bsg.it` ne dichiara **28**:
la lista era incompleta dal primo giorno, e sarebbe andata alla deriva a ogni pagina pubblicata.

L'elenco viene quindi letto **dal sitemap del sito sotto esame**, a ogni esecuzione. Non da
quello di produzione: si testa dev, quindi la lista deve descrivere dev. Verificato che il
sitemap di AIOSEO su dev è generato dinamicamente, contiene URL `dev.bsg.it`, e che tutte le 28
pagine dichiarate rispondono 200.

Sitemap inclusi: `page-sitemap` (28 URL), `post-sitemap` (35), `awsm_job_openings-sitemap` (7).
**Escluso `metform-form-sitemap`** (4 URL): sono i form stessi, non pagine da visitare. Totale
circa 70 URL.

**Il sitemap è generato da un plugin, quindi due paracadute sono obbligatori:**

1. **Soglia minima.** Se il sitemap restituisce meno di `minPages` URL, il run **fallisce**.
   Senza questo, un aggiornamento che rompe AIOSEO renderebbe la suite verde per non aver
   testato niente — il fallimento peggiore possibile.
2. **Nucleo obbligatorio.** Un elenco `core` di poche pagine in `targets.json`, testate sempre,
   qualunque cosa dica il sitemap.

---

## 4. Componenti

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
│       ├── contact-form.spec.ts     il form
│       ├── page-health.spec.ts      collaudo delle invarianti su pagine finte
│       └── clean-page.spec.ts       collaudo della fixture sul sito vero
├── scripts/
│   ├── firewall.mjs                 apre e ripristina la 443, unico punto che parla con AWS
│   └── lib/cidr-plan.mjs            calcolo puro delle regole, coperto da test
└── .github/workflows/post-update.yml   orchestrazione, nessuna logica di test
```

`targets.json` è **dati, non codice**: si modifica senza toccare TypeScript. Lo script del
firewall è l'unico pezzo che parla con AWS, e il calcolo delle regole è separato dalle chiamate
proprio per poter essere collaudato senza conseguenze.

---

## 5. `targets.json` — struttura

| Campo | A cosa serve |
|---|---|
| `baseUrl` | Il sito. Il validatore rifiuta un indirizzo `http://` (D4) |
| `minPages` | Sotto questo numero di pagine trovate, il run fallisce (D11) |
| `sitemaps` | Quali sitemap leggere |
| `excludePatterns` | URL da scartare da quella lista |
| `core` | Pagine controllate sempre, anche se il sitemap si rompesse |
| `defaultExpect` | Selettori che devono esistere su ogni pagina |
| `defaultCriticalImages` | Quante immagini devono risultare decodificate, per default |
| `acceptedConsoleErrors` | Errori noti da ignorare, ognuno con la sua `reason` obbligatoria |
| `overrides` | Deroghe per singola pagina: selettori, immagini, soglia di overflow, errori accettati |

Il validatore **rifiuta un'eccezione senza motivazione**: un errore accettato senza `reason`, o
una deroga sulla soglia di overflow senza `notes`, fanno fallire il caricamento del file.

I selettori strutturali di default sono `.main-header`, `nav`, `main`, `footer`. Il tema `most`
**non usa il tag `<header>`**: usa un `div` con quella classe. Verificato su sette pagine che
l'insieme è universale.

---

## 6. Le asserzioni

### Livello 1 — su ogni pagina

| Controllo | Guasto intercettato |
|---|---|
| Status 200, body privo di testo di errore fatale WordPress | White screen of death, fatal PHP |
| Nessun errore console nuovo, di primo dominio | Conflitto JS fra plugin |
| Nessuna richiesta di rete fallita | CSS, JS o immagini in 404 |
| Selettori di `expect` presenti | Sezione svanita |
| CSS realmente applicato | Foglio caricato ma non attivo |
| Nessun overflow orizzontale oltre la soglia | Layout esploso |
| Immagini critiche con `naturalWidth > 0` | Media library o CDN rotta |
| `<title>` non vuoto | Regressione SEO grossolana |

Gli errori di rete escludono `ERR_ABORTED`: un abort è una cancellazione decisa dalla pagina,
non un caricamento fallito, e MetForm ne produce uno di suo su ogni pagina con un form.

### Livello 2 — `/contact-us/`

Le tre asserzioni di D8: form idratato, consenso GDPR spuntabile, widget di verifica anti-bot
utilizzabile.

---

## 7. La fixture di soppressione overlay

Tre sorgenti di sovrapposizione intercettano i click e sono la causa più probabile di
instabilità dei test su questo sito.

| Overlay | Trattamento |
|---|---|
| `cookie-notice` | Cookie di consenso impostato prima del caricamento |
| Hustle (`wordpress-popup`) | Moduli `[class*="hustle-modal"]` e simili nascosti |
| `ai-chat-widget` | `#ai-chat-widget-root` nascosto |

Si usa `display:none` e non `visibility:hidden`: un popup che resta nel flusso può causare
overflow orizzontale e far fallire il controllo per niente. E la soppressione avviene **prima**
del caricamento, altrimenti il banner farebbe in tempo a comparire e a intercettare il primo
click.

Scritta una volta come fixture Playwright, si applica a tutta la suite.

---

## 8. Sicurezza

- **OIDC, non chiavi statiche.** In GitHub non vive nessuna credenziale AWS permanente
- **Policy IAM ristretta** a `GetInstancePortStates`, `OpenInstancePublicPorts` e
  `CloseInstancePublicPorts`. `PutInstancePublicPorts` **non concessa**, per rendere impossibile
  la cancellazione dell'allowlist. Lightsail ha un supporto limitato ai permessi a livello di
  risorsa, quindi la policy usa `"Resource": "*"` e la restrizione viene dal solo elenco delle
  azioni; se l'account contenesse altre istanze Lightsail andrebbe verificata una condizione
  basata sui tag
- **Finestra di apertura minima:** solo la 443, solo l'IP del runner, solo per la durata del run
- **Chiusura in `if: always()`**, con verifica dello stato risultante (D3)
- **Repo privato**
- **Nessuna credenziale WordPress** in nessun secret (D7)
- **Rate limiting Wordfence:** `workers: 1` e User-Agent riconoscibile. Una raffica di pagine da
  un solo IP può altrimenti far bloccare il runner
- **`noindex` assente su dev.bsg.it** (§2): lo staging è indicizzabile e compete con la
  produzione sugli stessi contenuti. È un problema indipendente da questo progetto, ma reale
- **Dati personali:** la presenza di All-in-One WP Migration indica che dev è probabilmente un
  clone della produzione. È una questione GDPR oltre che tecnica
- **wp-login in chiaro:** il certificato resta self-signed e HTTP resta aperto, quindi wp-admin è
  raggiungibile su canale non cifrato (D4)

**Rischio accettato, senza rete di sicurezza automatica.** Se il runner viene ucciso di colpo, lo
step `if: always()` può non eseguire e la 443 resta aperta all'IP di quel runner, che GitHub poi
riassegna a un altro suo cliente. Era previsto un workflow di riconciliazione giornaliero per
coprirlo, ma non si realizza: il rischio residuo è giudicato accettabile rispetto al costo di
mantenere una lista di CIDR di riferimento. Il controllo resta quindi manuale:
`aws lightsail get-instance-port-states` dopo un run finito male.

---

## 9. Costi

- **GitHub Actions:** un run consuma 9-10 minuti su `ubuntu-latest` (moltiplicatore 1x). Il piano
  Free include 2.000 minuti/mese su repo privati, quindi circa 200 esecuzioni. Il consumo resta
  interamente coperto dall'inclusa, **a condizione di cachare i browser Playwright**: senza cache
  il download se ne mangia una fetta
- **Lightsail:** nessun costo aggiuntivo
- **AWS API:** le chiamate usate sono gratuite

---

## 10. Manutenzione

Il sistema è nell'ordine delle 400 righe. L'unico file toccato con regolarità è `targets.json`,
e non contiene l'elenco delle pagine: solo le regole.

Il rischio di manutenzione non è tecnico: è che un test instabile eroda la fiducia e il report
smetta di essere aperto. Tutte le scelte di questo design — poche asserzioni, deterministiche,
nessuna baseline a pixel, errori noti dichiarati con la loro ragione, nessun test che dipenda da
una verifica anti-bot — servono a quello.

Playwright pinnato a versione esatta. CI e sviluppo entrambi su Node 24: il runner di test
integrato supporta i glob solo da Node 21, e tenere le due versioni allineate chiude l'intera
categoria dei "funziona sul mio computer".

---

## 11. Limiti di copertura, dichiarati

La suite **non** verifica:

- che un invio del form venga accettato dal server (D8)
- che la notifica email venga generata (D9 + D7)
- che l'entry sia persistita a database (D7)
- che la consegna della posta funzioni (D9)
- regressioni visive fini: un layout che cambia restando strutturalmente valido passa (D5)
- problemi TLS reali, **in permanenza**: `ignoreHTTPSErrors` non verrà rimosso perché il
  certificato non si installa (D4)
- i form di `/carriere/` e `/whistleblower/`
- performance, accessibilità, SEO oltre la presenza del `<title>`

---

## 12. Questioni aperte

**Nessuna bloccante.** Tutto risolto:

| Questione | Risposta |
|---|---|
| Istanza Lightsail e regione | `bsg-website-dev`, `eu-central-1` |
| Repo GitHub | `gsabia-bsg/dev-post-update-tests`, privato |
| Ruolo IAM | Creato: provider OIDC, policy `dev-bsg-firewall-ci`, ruolo `dev-bsg-firewall-ci-role` |
| Elenco degli URL | Letto dal sitemap a ogni esecuzione (D11) |
| CIDR di riferimento | Non necessari: il workflow di riconciliazione non si realizza (§8) |
| Certificato Let's Encrypt | Non si installa: il self-signed resta (D4) |

Raccomandato, non bloccante:

1. **Includere i form di `/carriere/` e `/whistleblower/`?** Le pagine sono già nello smoke, i
   loro form no. Il secondo è rilevante anche in senso normativo
2. **Notifiche su Teams:** GitHub invia già un'email sui workflow falliti. Un canale in più ha
   senso solo se si scopre di ignorare quell'email

---

## 13. Evoluzioni possibili

Tutte aggiungibili senza riprogettare, e filtrate contro il vincolo di indipendenza D10.

### Compatibili con D10

**La stessa suite anche su `www.bsg.it`.** È l'aggiunta a più alto valore: la suite oggi presidia
dev, ma il momento rischioso è quando si aggiorna la produzione. Non serve nessun firewall e
nessun ruolo, perché la produzione è pubblica: cambia solo la base URL.

**Trigger automatico senza codice sul server.** Un job `schedule` notturno può rilevare gli
aggiornamenti leggendo l'HTML pubblico: WordPress ed Elementor espongono la versione nei meta
`generator`, e i plugin nei parametri `?ver=` degli asset. Il job confronta con un manifest
committato ed esegue la suite se qualcosa è cambiato.

**Verifica della persistenza delle entry — sconsigliata allo stato attuale.** Una Application
Password in Basic Auth sulle REST API rispetterebbe D10, ma avrebbe senso solo su un canale
cifrato, e il certificato non si installa (D4): manderebbe una credenziale WordPress in chiaro a
ogni esecuzione.

**Sink di posta esterno.** Puntare WP Mail SMTP a una casella-trappola esterna è
un'impostazione dentro WordPress: rispetta D10 e chiuderebbe l'anello della consegna.

### Escluse da D10

**Hook `upgrader_process_complete` che chiama `repository_dispatch`.** Richiede un mu-plugin o
uno snippet sul server, più un token GitHub ospitato lì. Sostituita dal rilevamento versioni via
HTML pubblico.

**Mailpit sull'istanza.** Richiede l'installazione di un binario e di un servizio sulla macchina.
Se servirà copertura sulla posta, si usa il sink esterno.
