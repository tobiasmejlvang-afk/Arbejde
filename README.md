# Arbejde · Tid & Løn — v3.0.0

Personlig dansk app til arbejdstid, renovationsture, akkord, løn og fravær. Version 3 tilføjer lokal PDF-import af arbejdsplaner og en daglig timer. Det orange/grafit-design bruger de leverede logoer og 3D-ikoner samt en lokalt leveret Inter-skrifttype.

Appen gemmer data i din browserprofil. Der er ingen cloudkonto eller automatisk synkronisering. Kom hurtigt i gang med [START-HER.md](START-HER.md).

## Fra arbejdsplan til arbejdsdag

1. Opret eller ret **Job & kontrakt** med arbejdsuge, lønperiode og dine kontraktsatser.
2. Åbn **Importér arbejdsplan**, og vælg PDF-filer fra din enhed.
3. Vælg job og derefter **én person eller én vogn**. Gennemse datoer, navnematch, opgaver og eventuelle tider. Ret usikre rækker, vælg de ønskede vagter, og bekræft importen.
4. Se vagterne i **Kalender**. Brug **Arbejdstid** til at måle eller indtaste den faktisk udførte arbejdsdag.
5. Se periodens tal i **Overblik** og **Løn**, og tag en JSON-sikkerhedskopi.

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
| Importér arbejdsplan | Lokal PDF-læsning, udvælgelse og bekræftelse |
| Registreringer | Søg, ret, slet og eksportér arbejdsdage |
| Opret | Genveje til nye tilføjelser |
| Job & kontrakt | Arbejdsordning, satser og kontraktoplysninger |
| Fravær | Sygdom, fridage, ferie og feriefridage |
| Vogn & kollegaer | Privat register, søgning og kildekontrol |
| Statistik | Arbejdstid og aktivitet |
| Eksport | Tag oplysninger med videre |
| Indstillinger | Personlige valg, lister og fuld backup |

Chauffør og kollega/medhjælper er valgfrie registreringsfelter. De kan vælges fra registeret eller skrives manuelt og følger registreringen i søgning og CSV-eksport. Ekstra tømninger og andre opgaver hører til den samme vagt; deres tid lægges ikke oven i start/slut en ekstra gang.

## Privatliv, register og backup

PDF-filen behandles lokalt med den medfølgende Mozilla PDF.js-runtime. **PDF-bytes uploades ikke.** Den offentlige kode indeholder ingen private arbejdsplaner eller et udfyldt personale-/vognregister. Importerede oplysninger og bekræftede planer gemmes i din browser. Opbevar eksporter privat, da de kan indeholde navne, kontaktoplysninger og løndata.

Registerimport under **Vogn & kollegaer → Importér register** bruger JSON-typen `arbejde-directory`, version 1. Den erstatter registeret og føjer vognnumre til dine valgmuligheder. Jobs, lønsatser, arbejdsregistreringer, ture, planer og indstillinger bevares. Gem eventuelt det gamle register med **Download register** først.

En fuld JSON-backup under **Indstillinger** indeholder appens gemte datasæt, herunder register, planer og personlige valg. Fuld import gendanner hele datasættet. CSV er til videre bearbejdning; JSON bruges til gendannelse. Den separate, igangværende timer følger ikke med.

Gyldige ældre data beholdes automatisk på samme webadresse og i samme browserprofil. Lokal HTML, den udgivne app og andre browserprofiler har separat lagring. Brug eksport/import ved flytning mellem dem eller mellem Windows og Samsung-tablet. Browserdata kan forsvinde, når de ryddes; der er ingen automatisk synkronisering eller serverkopi.

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

Projektet har ingen byggeproces eller API-nøgler. Læg filerne i repositoryets rod, og vælg **Settings → Pages → Deploy from a branch → main → / (root)**. Relative stier understøtter `/Arbejde/`.

Når udgivelsen er klar, bruges [appens HTTPS-adresse](https://tobiasmejlvang-afk.github.io/Arbejde/) på begge enheder. Installer den via Edge-/Chrome-menuen på Windows eller **Installer app / Føj til startskærm** i Chrome på Samsung-tablet. Menutekster varierer. ZIP-filen er projektets kildekode.

Den installerede webapp cacher app- og PDF-runtimefiler til offlinebrug; tegnkort hentes ved behov og gemmes til senere. Den selvstændige HTML-kopi kan kræve internet for første indlæsning af PDF-læserens statiske filer fra appudgivelsen. PDF-data forbliver lokale. Ved nye udgivelser skal cacheversion og assetliste i `sw.js` opdateres. Genindlæs en allerede åben app efter opdateringen.

Der er ikke gennemført test på fysiske Windows-/Samsung-enheder.

## Beregninger og kilder

Løn er estimeret brutto før skat og øvrige fradrag. Ukendte satser starter på 0. Appen antager ingen lovbestemte satser, ferierettigheder eller automatisk sygeløn. De oplyste ordninger giver henholdsvis 36,99, 37 og 36,6 normale timer pr. uge; dagsgrænserne ændres ikke stiltiende til præcist 37 timer. Læs [RULES.md](RULES.md) før sammenligning med lønsedler.

| Filer | Formål |
| --- | --- |
| `app.js`, `panels.js`, `experience.js` | Navigation, formularer og visninger |
| `styles.css`, `brand.css`, `assets/brand/` | Responsivt orange/grafit-design og leveret grafik |
| `domain.js`, `directory-domain.js`, `directory-ui.js` | Beregninger og lokalt register |
| `pdf-reader.js`, `assets/pdfjs/` | Lokal PDF.js-læser med worker, tegnkort, fontdata og licenser |
| `schedule-parser.js`, `schedule-domain.js`, `schedule-import-ui.js` | Genkendelse, kontrol og import af PDF-planer |
| `timer-domain.js`, `timer-controller.js` | Daglig timer med separat lokal lagring |
| `manifest.webmanifest`, `sw.js` | Installation og offlinefiler |
| `serve.mjs`, `check.mjs`, `*.test.js` | Lokal server, syntakskontrol og tests |

Inter Variable 4.1 ligger lokalt i `assets/fonts/InterVariable.woff2`, vægte 100–900, med [OFL-licens](assets/fonts/Inter-OFL.txt) fra [det officielle Inter-projekt](https://github.com/rsms/inter/tree/v4.1). Mozilla PDF.js 6.4.299 er leveret uændret under Apache-2.0; se [runtime og proveniens](assets/pdfjs/README.md).

Lokalserveren bruger en Content Security Policy uden inline scripts eller `eval`. GitHub Pages understøtter ikke projektets egne HTTP-overskrifter. Private registre, PDF-filer og hemmeligheder skal holdes uden for den offentlige kildekode og offentlige udgivelser.
