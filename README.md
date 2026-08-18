# iPhone Photo Dashboard

Een responsive website plus serverless backend waarmee een iPhone Shortcut de nieuwste foto en metadata uploadt. De website kan via GitHub Pages worden gepubliceerd en gebruikt een Cloudflare Worker als backend. De website werkt op telefoon en pc en toont steeds alleen de laatste foto. Een nieuwe upload overschrijft de vorige foto in R2.

## Wat dit project doet

- Website voor telefoon en pc
- Nieuwste foto tonen
- Metadata tonen: locatie, tijd, batterij, device-info, iOS-versie, netwerk en extra velden
- Oude foto vervangen zodra de Shortcut een nieuwe foto uploadt
- PC-knop die een foto-opdracht klaarzet op de backend
- Endpoint waarmee een iPhone Shortcut kan controleren of er een opdracht klaarstaat
- Geen valse belofte dat een pc rechtstreeks je iPhone-camera kan starten
- GitHub Pages workflow voor de statische website

## Architectuur

```text
Website op telefoon/pc, bijvoorbeeld GitHub Pages
  -> Cloudflare Worker
  -> KV: metadata + pending opdracht
  -> R2: latest-photo

iPhone Shortcut
  -> maakt foto
  -> haalt locatie en metadata op
  -> uploadt multipart/form-data naar /api/upload
```

Belangrijk: een browser op je pc kan niet direct een Siri Shortcut op je iPhone starten. De knop op de pc doet daarom dit:

1. De website roept `POST /api/request-photo` aan.
2. De Worker bewaart een pending opdracht in KV.
3. De iPhone Shortcut moet die opdracht ophalen via `GET /api/command`.
4. Als er een opdracht is, maakt de Shortcut een foto en uploadt die.

Voor echt automatisch PC -> iPhone heb je een aparte trigger nodig, bijvoorbeeld Pushcut, een periodieke persoonlijke automatisering, of een andere notificatie/automation-app. Zonder zo'n trigger kun je de Shortcut handmatig starten of vanaf de iPhone op de website op "Shortcut openen" tikken.

## GitHub Pages publiceren

Ja: de website zelf kan via GitHub Pages draaien. In deze repo staat daarvoor `.github/workflows/deploy-pages.yml`.

GitHub Pages kan alleen statische bestanden hosten. Daarom kan GitHub Pages niet zelf:

- foto's ontvangen van Shortcuts
- secrets zoals `UPLOAD_TOKEN` veilig bewaren
- de nieuwste foto opslaan en vervangen
- metadata bewaren

Daarom blijft de Cloudflare Worker nodig als backend. Na deployment gebruik je dus twee URLs:

- Website: `https://unity4ever.github.io/iphone-photo-dashboard/`
- Backend: je Worker URL, bijvoorbeeld `https://iphone-photo-dashboard.<jouw-subdomein>.workers.dev`

### Pages aanzetten

1. Open de repository op GitHub.
2. Ga naar **Settings** -> **Pages**.
3. Kies bij **Build and deployment** de source **GitHub Actions**.
4. Ga naar **Actions** en start eventueel de workflow **Deploy GitHub Pages** handmatig.

Na een succesvolle run opent de website op:

```text
https://unity4ever.github.io/iphone-photo-dashboard/
```

Vul op de website bij **Backend URL** je Worker URL in. Die waarde wordt alleen lokaal in je browser bewaard. Op je telefoon en pc moet je dit dus eenmalig invullen.

## Bestanden

- `public/index.html` - de webinterface
- `public/styles.css` - responsive styling
- `public/app.js` - dashboard refresh, foto-opdracht knop en Shortcut-link
- `src/index.js` - Cloudflare Worker API
- `wrangler.jsonc` - Cloudflare Worker, Assets, KV en R2 configuratie
- `.dev.vars.example` - voorbeeld voor lokale secrets
- `.github/workflows/deploy-pages.yml` - GitHub Pages publicatie van de statische website

## Cloudflare setup

Je hebt nodig:

- Een Cloudflare-account
- Node.js
- Wrangler

Installeer dependencies:

```bash
npm install
```

Log in bij Cloudflare:

```bash
npx wrangler login
```

Maak een R2 bucket:

```bash
npx wrangler r2 bucket create iphone-photo-dashboard
```

Maak een KV namespace:

```bash
npx wrangler kv namespace create PHOTO_STATE
```

Kopieer de `id` uit de output en vervang in `wrangler.jsonc`:

```jsonc
"id": "REPLACE_WITH_KV_NAMESPACE_ID"
```

Zet secrets:

```bash
npx wrangler secret put UPLOAD_TOKEN
npx wrangler secret put DASHBOARD_PIN
```

Gebruik voor `UPLOAD_TOKEN` een lange willekeurige tekst. Deze token komt alleen in je Shortcut. `DASHBOARD_PIN` is de pincode die de dashboardknop beschermt.

Deploy:

```bash
npm run deploy
```

Na deploy krijg je een URL zoals:

```text
https://iphone-photo-dashboard.<jouw-subdomein>.workers.dev
```

Gebruik die URL in de Shortcut-stappen hieronder.

Gebruik dezelfde URL ook als **Backend URL** op de GitHub Pages website.

## Shortcut maken op iPhone

Maak in de app Opdrachten een nieuwe opdracht met exact deze naam:

```text
Photo Dashboard Capture
```

Vervang in de stappen hieronder:

- `WORKER_URL` door je Worker URL, bijvoorbeeld `https://iphone-photo-dashboard.jij.workers.dev`
- `UPLOAD_TOKEN` door dezelfde geheime token die je bij Cloudflare hebt ingesteld

### Basisversie

1. Voeg actie **Maak foto** toe.
   - Camera: Achterkant
   - Toon cameravoorvertoning: aan of uit, naar keuze
   - Resultaat heet in Shortcuts meestal `Foto`

2. Voeg actie **Haal huidige locatie op** toe.

3. Voeg actie **Haal huidige datum op** toe.

4. Voeg actie **Haal batterijpercentage op** toe.

5. Voeg actie **Haal apparaatdetails op** toe.
   - Detail: Apparaatnaam

6. Voeg nog een actie **Haal apparaatdetails op** toe.
   - Detail: Model

7. Voeg nog een actie **Haal apparaatdetails op** toe.
   - Detail: Systeemversie

8. Voeg actie **Haal inhoud van URL op** toe.
   - URL: `WORKER_URL/api/upload`
   - Methode: `POST`
   - Headers:
     - `Authorization`: `Bearer UPLOAD_TOKEN`
   - Vraag om body: `Formulier`
   - Formuliervelden:
     - `photo` = de gemaakte foto, type Bestand
     - `capturedAt` = huidige datum
     - `latitude` = breedtegraad van huidige locatie
     - `longitude` = lengtegraad van huidige locatie
     - `horizontalAccuracy` = horizontale nauwkeurigheid van huidige locatie
     - `batteryLevel` = batterijpercentage
     - `deviceName` = apparaatnaam
     - `deviceModel` = model
     - `systemVersion` = systeemversie
     - `shortcutVersion` = `1.0`

9. Voeg optioneel actie **Toon melding** toe.
   - Tekst: `Foto geupload naar dashboard`

Shortcuts kan locatie-eigenschappen soms net anders tonen afhankelijk van je iOS-taal. Kies bij locatievelden steeds de eigenschap van `Huidige locatie`, zoals breedtegraad, lengtegraad en nauwkeurigheid.

## PC-trigger gebruiken

De pc-knop zet alleen een opdracht klaar. Maak daarom een tweede Shortcut, bijvoorbeeld:

```text
Photo Dashboard Check Command
```

Stappen:

1. **Haal inhoud van URL op**
   - URL: `WORKER_URL/api/command`
   - Methode: `GET`

2. **Haal waarde op uit woordenboek**
   - Waarde: `hasCommand`

3. **Als** `hasCommand` is `waar`
   - Voer opdracht `Photo Dashboard Capture` uit

4. Anders: stop de opdracht.

Je kunt deze check-Shortcut handmatig starten. Wil je dat de pc-knop vrijwel automatisch werkt, dan heb je een trigger nodig die deze check-Shortcut op je iPhone start. Mogelijkheden:

- iPhone: zet een persoonlijke automatisering op een tijdschema of bij het openen van een app.
- Pushcut: laat een server/webhook een notificatie sturen die een Shortcut kan starten.
- Een andere automation-app of thuisserver die een iPhone-notificatie of lokale actie triggert.

Zonder zo'n extra trigger kan een pc-browser de iPhone niet wakker maken om de camera te openen.

## API

### `GET /api/status`

Geeft de nieuwste metadata, foto-URL en pending opdracht terug.

### `GET /api/photo`

Geeft de nieuwste foto terug. Als er nog geen foto is, krijg je `404`.

### `POST /api/upload`

Upload vanaf Shortcuts.

Headers:

```text
Authorization: Bearer UPLOAD_TOKEN
```

Body: `multipart/form-data`

Vereist veld:

- `photo`

Optionele velden:

- `capturedAt`
- `latitude`
- `longitude`
- `altitude`
- `horizontalAccuracy`
- `verticalAccuracy`
- `batteryLevel`
- `batteryState`
- `deviceName`
- `deviceModel`
- `systemVersion`
- `networkType`
- `shortcutVersion`
- `notes`
- `extra`

### `POST /api/request-photo`

Zet een opdracht klaar voor de iPhone.

Header wanneer `DASHBOARD_PIN` is ingesteld:

```text
X-Dashboard-Pin: jouw-pin
```

### `GET /api/command`

Door de check-Shortcut te gebruiken om te zien of de pc-knop een foto-opdracht heeft klaargezet.

## Lokale test

Maak `.dev.vars` op basis van `.dev.vars.example` en vul je eigen waarden in.

```bash
npm run dev
```

Open daarna de lokale Wrangler URL.

## Privacy en veiligheid

- Zet je `UPLOAD_TOKEN` nooit in de websitecode.
- Deel je `DASHBOARD_PIN` alleen met mensen die een foto-opdracht mogen klaarzetten.
- De foto staat in je Cloudflare R2 bucket onder vaste key `latest-photo`; daardoor vervangt elke upload de vorige foto.
- Metadata staat in KV onder `latest-metadata`.
- Locatiegegevens zijn gevoelig. Gebruik dit dashboard alleen als je begrijpt wie toegang heeft tot je Worker URL.
