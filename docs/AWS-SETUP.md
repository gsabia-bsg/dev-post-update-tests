# Configurazione AWS per il workflow

Da eseguire una volta sola, da un'utenza con permessi **IAM** (non basta Lightsail).
Al termine serve una sola cosa: l'**ARN del ruolo**, da mettere nei secret del repo.

**Dati di questo ambiente:**

| | |
|---|---|
| Istanza Lightsail | `bsg-website-dev` |
| Regione | `eu-central-1` (Frankfurt) |
| Repo GitHub | `gsabia-bsg/dev-post-update-tests` |

Sostituisci `<ID_ACCOUNT>` con l'ID numerico dell'account AWS: lo leggi in alto a
destra nella console, cliccando sul nome dell'account.

---

## Passo 1 — Il provider di identità GitHub

Serve una volta per account. Se esiste già, salta al passo 2.

IAM → Identity providers → **Add provider** → OpenID Connect:

- **Provider URL:** `https://token.actions.githubusercontent.com`
- **Audience:** `sts.amazonaws.com`

## Passo 2 — La policy dei permessi

IAM → Policies → **Create policy** → scheda JSON, incolla:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SoloLePorteDelFirewall",
      "Effect": "Allow",
      "Action": [
        "lightsail:GetInstancePortStates",
        "lightsail:OpenInstancePublicPorts",
        "lightsail:CloseInstancePublicPorts"
      ],
      "Resource": "*"
    }
  ]
}
```

Nome suggerito: `dev-bsg-firewall-ci`.

**Perché queste tre azioni e non altre.** Il workflow legge lo stato delle porte,
lo riscrive aggiungendo l'IP del runner, e a fine test riscrive esattamente quello
che aveva letto. Non gli serve nient'altro.

**Perché `PutInstancePublicPorts` non c'è.** Quella API chiude tutte le porte non
elencate nella richiesta: usata male cancellerebbe l'allowlist dell'ufficio e ti
chiuderebbe fuori dal tuo sito. Non concedendola, il workflow **non ha la
possibilità fisica** di provocare quel danno. È una scelta deliberata: non
aggiungerla nemmeno per comodità.

**Sul `"Resource": "*"`.** Lightsail ha un supporto limitato ai permessi a livello
di singola risorsa, quindi la restrizione qui viene dall'elenco delle azioni, non
dall'ARN. In pratica: questo ruolo può aprire e chiudere porte su istanze
Lightsail dell'account, e nient'altro. Se nell'account ci sono **altre istanze
Lightsail** oltre a `bsg-website-dev`, dimmelo: verifichiamo se per queste azioni
è possibile una condizione basata sui tag.

## Passo 3 — Il ruolo

IAM → Roles → **Create role** → **Web identity**:

- **Identity provider:** `token.actions.githubusercontent.com`
- **Audience:** `sts.amazonaws.com`
- **GitHub organization:** `gsabia-bsg`
- **GitHub repository:** `dev-post-update-tests`

Allega la policy del passo 2. Nome suggerito: `dev-bsg-firewall-ci-role`.

Poi apri la scheda **Trust relationships** e verifica che assomigli a questo —
la condizione sul `sub` è ciò che impedisce ad altri repository di assumere il
ruolo:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ID_ACCOUNT>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:gsabia-bsg/dev-post-update-tests:*"
        }
      }
    }
  ]
}
```

## Passo 4 — Le variabili nel repo GitHub

Settings → Secrets and variables → Actions:

| Nome | Tipo | Valore |
|---|---|---|
| `AWS_ROLE_ARN` | Secret | l'ARN del ruolo creato al passo 3 |
| `LIGHTSAIL_INSTANCE_NAME` | Variable | `bsg-website-dev` |
| `AWS_REGION` | Variable | `eu-central-1` |

## Passo 5 — La prova

Lancia il workflow dalla tab Actions con una nota qualsiasi, per esempio
*"prima prova, nessun aggiornamento"*. Poi verifica **a mano** che il firewall sia
tornato come prima: Lightsail → `bsg-website-dev` → Networking → IPv4 Firewall.

Se il run fallisce nello step di apertura, il problema è nei permessi o nella
relazione di fiducia; il log dice quale dei due.

---

## Nessuna chiave permanente

In GitHub non vive nessuna credenziale AWS. Il runner ottiene un token
temporaneo tramite OIDC, valido per la durata del job e solo per quel repository.
Non c'è niente da ruotare e niente che possa essere rubato da un secret.
