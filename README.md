# Arbejde · Tid & Løn — v3.4.0

Personlig dansk app til arbejdstid, renovationsture, akkord, løn og fravær. Version 3 tilføjer lokal PDF-import af arbejdsplaner og en daglig timer. Det orange/grafit-design bruger de leverede logoer og 3D-ikoner samt en lokalt leveret Inter-skrifttype.

Appen gemmer data i browserprofilen. Med en konto under **Indstillinger → Login og synkronisering** synkroniseres gemte data og billeder mellem dine enheder. Kom hurtigt i gang med [START-HER.md](START-HER.md).

## Version 3.2

Under **Job & kontrakt** kan du angive to fulde timesatser for overarbejde. Brug **Overarbejde på sats 2 (min.)** i arbejdsregistreringen til at fordele overarbejdet. Appen bruger højst vagtens beregnede overarbejdsminutter på sats 2. Resten beregnes med sats 1, som fortsat er standard for tidligere registreringer. Fordelingen vises i **Løn & opsparing** og følger med i CSV-eksporten.

Under **Indstillinger → Avancerede indstillinger** kan du vælge tema, menuplacering og startside. Her kan du også tilpasse overblikkets diagram og aktivitet, hurtigværktøjerne og visningen af timeren. En timer i gang kan stadig afsluttes.

## Version 3.1

Registreringen har synlige affaldsfelter, noter, billedvedhæftninger og et valg for fuldt overarbejde på den ugentlige fridag. Under **Ture** kan du gemme en fast rute til en ugedag i lige, ulige eller alle uger. Vælg ruten i en arbejdsregistrering for at udfylde vogn, affald og tømninger.

Opret en konto eller log ind med samme e-mail på dine enheder. Første gang kan du vælge **Kopiér lokale data til kontoen** under Indstillinger. Timeren kører på den enhed, hvor du starter den, og arbejdsdagen synkroniseres efter gemning. Ved samtidige ændringer i begge kopier vælger du, hvilken version der skal beholdes.

Se [Supabase-opsætning](supabase/README.md) ved brug af dit eget projekt. JSON-kopier indeholder registreringer og billedhenvisninger. Billedfiler gemmes lokalt og på kontoen efter synkronisering.

## Rettelser i 3.0.1

Gennemgang af registrering, kalender, import, job, register, statistik, timer og backup. Gemmeknapper viser ikke længere succes ved lagerfejl, og genforsøg opretter ikke dubletter. Enkeltdagsplaner og sygedagens arbejdsuge bevares ved redigering. Lønkortet bruger det viste jobs lønperiode. Formularer beskytter mod ændringer i andre faner, og demovisning bevarer nye oplysninger fra den rigtige visning.

Hvis gemte data ikke kan læses, bliver de oprindelige data ikke overskrevet. Brug **Download oprindelige data** i beskeden, og gendan derefter en gyldig JSON-sikkerhedskopi efter bekræftelse. En aktiv timer skal afsluttes før gendannelse.

## Fra arbejdsplan til arbejdsdag

1. Opret eller ret **Job & kontrakt** med arbejdsuge, lønperiode og dine kontraktsatser.
2. Åbn **Kalender → Importér arbejdsplan**, og vælg PDF-filer eller en Arbejde-kalenderfil (JSON) fra din enhed.
3. Vælg jobbet. Ved PDF-import vælger du også **én person eller én vogn**. Gennemgå datoer, navne, opgaver og eventuelle tider, før du vælger og tilføjer vagterne.
4. Se vagterne i **Kalender**. Brug **Arbejdstid** til at måle eller indtaste den faktisk udførte arbejdsdag.
5. Se periodens tal i **Overblik** og **Løn**, og tag en JSON-sikkerhedskopi.

### Kalenderfil (JSON)

Brug **Vælg kalenderfil (JSON)** i **Importér arbejdsplan**, og vælg det eksisterende job, vagterne hører til. Kalenderfilen angiver, hvem planerne gælder for. Vælg de ønskede rækker i gennemgangen, og tryk **Tilføj vagter**. Rækker med flere mulige navne er fravalgt som standard og kræver en bekræftelse, hvis du vælger dem.

Gentagen import springer dubletter over, og appen viser eventuelle konflikter før lagring. Importen bevarer gemte arbejdsregistreringer og manuelle planer. Hvis filen indeholder alternative stavemåder, kan du vælge at rette præcise navnetræf i tidligere importerede planer for det valgte job og i din standardchauffør. En række uden tider gemmes som heldagsplan.

### PDF-import

Læseren understøtter NVF-ugeplanernes tabel med vognrækker, ugens dage og personnavne. Tekst og udfyldte formularfelter læses med deres placering på siden. Andre PDF-layouts kan kræve manuel gennemgang og er ikke garanteret genkendt. Grænsen er 20 MiB og 30 sider pr. fil. Scannede PDFer uden tekstlag understøttes ikke; der er ingen OCR i appen.

Importen viser dit valgte udsnit før lagring. Usikre eller delvise navnematch kræver dit aktive valg og bekræftelse. Personnoter og navnestumper bliver ikke automatisk til fravær. Kontrollér altid type og kilde for rækker til gennemgang. Dubletter springes over; konflikter vises. Manuelle planer og gemte arbejdsregistreringer bliver ikke automatisk erstattet.

PDF-vagter er **planer**. Rækker uden start/slut gemmes som heldagsplaner uden opfundne timer. Du kan vælge standardtider, hvis de passer til din plan. Hverken tidsangivne eller tidsløse planer tæller som faktisk arbejdstid, løn eller registreret fravær. Det kræver en særskilt, gemt registrering.

Valget af person eller vogn kan huskes med **Brug dette valg til min daglige visning**. Det hjælper den daglige visning med at finde de relevante planer og udfylde oplysninger. Du kan stadig rette job, vogn, tur og bemanding ved registreringen.

### Daglig timer

Start timeren, når arbejdsdagen faktisk begynder. Brug pause og fortsæt undervejs. Start, pauser og status gemmes separat i samme browser, så timeren kan gendannes efter genindlæsning. Tiden beregnes fra enhedens klokkeslæt.

Stop timeren, når arbejdet slutter. Gennemgå start/slut, ubetalt pause, vogn, tur og øvrige oplysninger i registreringsformularen, og gem arbejdsdagen. Først da indgår dagen i timer og løn. Du kan også indtaste eller rette tider manuelt under **Arbejdstid** og **Registreringer**.

En aktiv eller stoppet timer, som endnu ikke er gemt som arbejdsregistrering, indgår **ikke** i appens JSON-backup. Afslut og gem arbejdsdagen før flytning til en anden enhed eller gendannelse af data.

## Sider og sammenhæng

| Side | Indhold |
| --- | --- |
| Overblik | Nøgletal, arbejdsuge og genveje |
| Arbejdstid | Daglig timer og manuel registrering |
| Løn | Normaltid, overarbejde og estimeret brutto |
| Kalender | Planer, registreringer, fravær og vejledende løndage |
| Importér arbejdsplan | Lokal import af PDF-ugeplaner og JSON-kalenderfiler med gennemgang |
| Registreringer | Søg, ret, slet og eksportér arbejdsdage |
| Opret | Genveje til nye tilføjelser |
| Job & kontrakt | Arbejdsordning, satser og kontraktoplysninger |
| Fravær | Sygdom, fridage, ferie og feriefridage |
| Vogn & kollegaer | Privat register, søgning og kildekontrol |
| Affaldscentre | Kundenumre, varekoder, adresser og aflæsningsinstruktioner |
| Statistik | Arbejdstid og aktivitet |
| Eksport | Tag oplysninger med videre |
| Indstillinger | Personlige valg, lister og fuld backup |

Chauffør og kollega/medhjælper er valgfrie registreringsfelter. De kan vælges fra registeret eller skrives manuelt og følger registreringen i søgning og CSV-eksport. Ekstra tømninger og andre opgaver hører til den samme vagt; deres tid lægges ikke oven i start/slut en ekstra gang.

## Privatliv, register og backup

Browseren læser PDF- og kalenderfiler på enheden. PDF-læsning bruger den medfølgende Mozilla PDF.js-runtime. Ved kontosynkronisering følger gemte planer med som kalenderdata. Kildefilerne bliver på enheden. Den offentlige kode leveres med et tomt register. Opbevar eksporter privat, da de kan indeholde navne, kontaktoplysninger og løndata.

Registerimport under **Vogn & kollegaer → Importér register** bruger JSON-typen `arbejde-directory`, version 1. Den erstatter registeret og føjer vognnumre til dine valgmuligheder. Jobs, lønsatser, arbejdsregistreringer, ture, planer og indstillinger bevares. Gem eventuelt det gamle register med **Download register** først.

Vælg **Affaldscentre → Importér liste (JSON)** for at åbne en privat liste med centre, varekoder og kundenumre. Appen viser ændringerne før gemning og bevarer eksisterende udfyldte felter. Du kan søge på navn, affaldstype, varekode eller kundenummer og redigere adresser og instruktioner for hvert center.

En JSON-backup under **Indstillinger** indeholder registreringer, register, planer, personlige valg og henvisninger til vedhæftede billeder. Billedfilerne og den igangværende timer ligger separat. Import af en fuld JSON-backup gendanner hele datasættet. CSV-filerne er beregnet til brug i regneark.

Gyldige ældre data beholdes automatisk på samme webadresse og i samme browserprofil. Lokal HTML, den udgivne app og andre browserprofiler har separat lagring. Log ind på samme konto under **Indstillinger** for at synkronisere gemte data mellem enhederne, når de er online. Ved brug uden konto kan du flytte registreringerne med JSON-eksport og -import. Gem en kopi, før du rydder browserdata.

## Start lokalt

Installer **Node.js 22.13 eller nyere**. Åbn en terminal i projektmappen:

```sh
npm start
```

Åbn [http://127.0.0.1:4173](http://127.0.0.1:4173). Runtimefilerne er leveret med projektet, så `npm install` er ikke nødvendigt. Kør tests og syntakskontrol med:

```sh
npm test
npm run check
```

For adgang fra tabletten på samme netværk kan PowerShell starte serveren med `$env:HOST = '0.0.0.0'` før `npm start`. Åbn computerens lokale IP-adresse med port 4173, og tillad forbindelsen i firewallen. Installation og service worker kræver HTTPS eller localhost.

## Udgiv og installer

Webappen kan udgives direkte fra repositoryets rod med **Settings → Pages → Deploy from a branch → main → / (root)**. Relative stier understøtter `/Arbejde/`. Kontofunktionen bruger en offentlig Supabase-nøgle til browseren og adgangsregler på serveren. Brug [Supabase-opsætningen](supabase/README.md) ved udgivelse med dit eget projekt.

Når udgivelsen er klar, bruges [appens HTTPS-adresse](https://tobiasmejlvang-afk.github.io/Arbejde/) på begge enheder. Installer den via Edge-/Chrome-menuen på Windows eller **Installer app / Føj til startskærm** i Chrome på Samsung-tablet. Menutekster varierer. ZIP-filen er projektets kildekode.

Åbn den installerede webapp online første gang, så appen og PDF-læseren kan gemmes til offlinebrug. PDF-tegnkort hentes efter behov og gemmes til senere. HTML-kopien henter PDF-læserens statiske filer fra appudgivelsen, så den kan kræve internet ved PDF-import. Selve PDF-filen behandles på enheden.

Når en opdatering er hentet, tager den over efter lukning af alle Arbejde-faner og appvinduer. Gem eventuelt åbne formularer, luk vinduerne, og åbn appen igen. Ved udgivelse skal cacheversionen og listen over offlinefiler i `sw.js` passe til udgivelsen.

Der er ikke gennemført test på fysiske Windows-/Samsung-enheder.

## Beregninger og kilder

Løn er estimeret brutto før skat og øvrige fradrag. Ukendte satser starter på 0. Appen antager ingen lovbestemte satser, ferierettigheder eller automatisk sygeløn. De oplyste ordninger giver henholdsvis 36,99, 37 og 36,6 normale timer pr. uge; dagsgrænserne ændres ikke stiltiende til præcist 37 timer. Læs [RULES.md](RULES.md) før sammenligning med lønsedler.

| Filer | Formål |
| --- | --- |
| `app.js`, `panels.js`, `experience.js` | Navigation, formularer og visninger |
| `styles.css`, `brand.css`, `assets/brand/` | Responsivt orange/grafit-design og leveret grafik |
| `domain.js`, `directory-domain.js`, `directory-ui.js` | Beregninger og lokalt register |
| `pdf-reader.js`, `assets/pdfjs/` | Lokal PDF.js-læser med worker, tegnkort, fontdata og licenser |
| `schedule-parser.js`, `schedule-domain.js`, `schedule-import-ui.js` | Genkendelse, kontrol og import af arbejdsplaner |
| `data-store.js` | Beskyttet lagring, gendannelse og kontrol af ændringer fra andre faner |
| `timer-domain.js`, `timer-controller.js` | Daglig timer med separat lokal lagring |
| `manifest.webmanifest`, `sw.js` | Installation og offlinefiler |
| `serve.mjs`, `check.mjs`, `*.test.js` | Lokal server, syntakskontrol og tests |

Inter Variable 4.1 ligger lokalt i `assets/fonts/InterVariable.woff2`, vægte 100–900, med [OFL-licens](assets/fonts/Inter-OFL.txt) fra [det officielle Inter-projekt](https://github.com/rsms/inter/tree/v4.1). Mozilla PDF.js 6.4.299 er leveret uændret under Apache-2.0; se [runtime og proveniens](assets/pdfjs/README.md).

Lokalserveren bruger en Content Security Policy uden inline scripts eller `eval`. GitHub Pages understøtter ikke projektets egne HTTP-overskrifter. Private registre, PDF-filer og hemmeligheder skal holdes uden for den offentlige kildekode og offentlige udgivelser.
