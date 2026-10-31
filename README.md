# Arbejde · Tid & Løn — v2.0.0

En personlig, dansk app til arbejdstid, renovationsture, akkord, løn og fravær. Version 2 samler arbejdsdagen i et nyt orange/grafit-design med de leverede logoer, 3D-ikoner og et lokalt register over vogne og kollegaer.

Appen er en statisk webapp uden eksterne JavaScript-pakker, cloudkonto eller serverdatabase. Alle skrifttyper og grafiske appfiler leveres sammen med koden. Dine registreringer og importerede registeroplysninger gemmes lokalt i din browserprofil.

## Appens 12 sider

| Side | Indhold |
| --- | --- |
| Overblik | Periodens nøgletal, arbejdsuge og genveje |
| Arbejdstid | Daglig registrering af start/slut, pauser, tur, bemanding og opgaver |
| Løn | Normaltid, overarbejde og estimeret bruttoløn |
| Kalender | Registreringer, arbejdsplaner, fravær og vejledende løndage |
| Registreringer | Søg, ret, slet og eksportér registreringer |
| Opret | Samlede genveje til nye tilføjelser |
| Job & kontrakt | Arbejdsordning, satser, lønperiode og kontraktoplysninger |
| Fravær | Sygdom, fridage, ferie og feriefridage |
| Vogn & kollegaer | Privat, lokalt register med søgning og kildekontrol |
| Statistik | Sammenlign arbejdstid og aktivitet |
| Eksport | Eksportmuligheder og hjælp til at tage oplysninger med videre |
| Indstillinger | Personlige indstillinger, vogn-/turlister og fuld sikkerhedskopi |

## Kom godt i gang

1. Opret eller ret dit job under **Job & kontrakt**. Vælg arbejdsuge, og udfyld satserne fra din kontrakt.
2. Tilføj vogne og ture, eller importér dit eget register under **Vogn & kollegaer**.
3. Registrér hele arbejdsdagen under **Arbejdstid**. Ekstra tømninger og andet arbejde knyttes til den samme vagt.
4. Tilføj planer og fravær. Åbn eksisterende registreringer for at rette dato, timer eller øvrige oplysninger.
5. Brug periodens eller månedens tal i **Overblik** og **Løn**, og tag jævnligt en JSON-sikkerhedskopi.

Chauffør og kollega/medhjælper er valgfrie felter i den daglige registrering. De kan vælges fra dit lokale register eller udfyldes manuelt. Navnene følger registreringen, kan findes med søgning og indgår i CSV-eksporten sammen med vogn, tur og timer.

## Privat register og sikkerhedskopier

Den offentlige projektkode indeholder ikke et udfyldt firma- eller personaleregister. Du kan oprette vogne og kollegaer manuelt eller importere din egen JSON-fil via **Vogn & kollegaer → Importér register**. Registeret understøtter tilknyttede chauffører, kontaktoplysninger, kildereferencer og punkter, der kræver kontrol.

Registerimport bruger filtypen `arbejde-directory`, version 1. Den erstatter det aktuelle register og føjer de importerede vognnumre til dine valgmuligheder. **Dine jobs, lønsatser, arbejdsregistreringer, ture, planer og øvrige indstillinger bevares.** Gem eventuelt det eksisterende register med **Download register**, inden det erstattes.

En fuld JSON-sikkerhedskopi fra **Indstillinger** indeholder hele appens datasæt, inklusive registeret. Fuld import er en gendannelse af datasættet og skal behandles anderledes end registerimport. Læs dialogen, og gem en backup inden gendannelse. CSV er til tabeller og videre bearbejdning; brug JSON, når data skal gendannes i appen.

Version 2 genbruger den eksisterende lagernøgle og understøtter det tidligere dataformat. På samme webadresse og i samme browserprofil indlæses gyldige eksisterende data automatisk. Ældre sikkerhedskopier uden registerfelt åbnes med et tomt register. Flytning mellem lokal HTML, en udgivet webadresse eller en anden browser kræver eksport/import.

Der er ingen automatisk synkronisering mellem Windows og tablet. Sletning af browserdata eller privat browsing kan fjerne lokale oplysninger. Opbevar JSON- og CSV-filer privat; de kan indeholde personoplysninger og løndata. Upload dem ikke til et offentligt repository eller en offentlig udgivelse.

## Start lokalt

Installer Node.js 20 eller nyere. Åbn en terminal i projektmappen:

```sh
npm start
```

Åbn [http://127.0.0.1:4173](http://127.0.0.1:4173). `npm install` er ikke nødvendigt. Kør beregnings-/datatests og syntakskontrol med:

```sh
npm test
npm run check
```

For at åbne den lokale server fra tabletten på samme netværk kan serveren bindes til netværket. I PowerShell:

```powershell
$env:HOST = '0.0.0.0'
npm start
```

Åbn computerens lokale IP-adresse med port 4173 på tabletten. Det kræver, at firewallen tillader forbindelsen. Installation og service worker kræver HTTPS eller localhost; brug en HTTPS-udgivelse til almindelig brug på begge enheder.

## Udgiv og installer

Læg projektfilerne i roden af repositoryet. I **Settings → Pages** vælges **Deploy from a branch → main → / (root)**. De relative appstier fungerer under `/Arbejde/`; der kræves ingen byggeproces eller API-nøgler.

Når udgivelsen er klar, bruges [appens HTTPS-adresse](https://tobiasmejlvang-afk.github.io/Arbejde/) på begge enheder. På Windows åbnes den i Edge eller Chrome og installeres via browserens installationsikon eller menu. På Samsung-tablet åbnes den i Chrome; vælg **Installer app** eller **Føj til startskærm**. Menutekster afhænger af browseren. Et ZIP-download er projektets kildekode; den installerede app tilføjes fra HTTPS-adressen.

Service workeren gemmer appfiler til offlinebrug efter en vellykket installation. Ved udgivelser hentes onlinefiler på ny. Opdatér cacheversionen og assetlisten i `sw.js`, når filer ændres. En allerede åbnet app kan kræve genindlæsning.

Responsivt design og PWA-understøttelse er implementeret. Visuel browserkontrol og test på fysiske Windows-/Samsung-enheder af version 2 er endnu ikke gennemført.

## Beregninger

Løn er et estimat af brutto før skat og øvrige fradrag. Ukendte satser starter på 0 og skal udfyldes fra kontrakten. Appen antager ingen lovbestemte satser, ferierettigheder eller automatisk sygeløn. Pension, frivalg og fravær følger de gemte indstillinger.

De angivne ordninger giver 3 × 12,33 = **36,99 timer**, 4 × 9,25 = **37 timer** og 4 × 7,4 + 7,0 = **36,6 timer**. Appen ændrer ikke dagstallene til præcist 37 timer. Du vælger ordning på job og registrering; de præcise grænser er defineret i `domain.js`. 12,33 er decimaltimer.

Ekstra tømninger og andre opgaver ligger inden for vagtens start/slut og lægges ikke til arbejdstiden igen. Læs [beregningsprincipperne](RULES.md), før du sammenholder estimaterne med lønsedler.

## Design og kildefiler

Den orange/grafit-identitet bygger på brugerens leverede grafik, beskåret og skaleret til appbrug. Paletten bruger orange `#FF8A00`/`#FF6600`, grafit `#3E4045`, kulgrå `#25272B`, baggrund `#121315` og varm neutral `#D9D1C7`.

Den faktiske Inter Variable-skrifttype leveres lokalt i `assets/fonts/InterVariable.woff2`, vægte 100–900. Den er hentet uændret fra [det officielle Inter-projekt, version 4.1](https://github.com/rsms/inter/tree/v4.1) og distribueres med [SIL Open Font License 1.1](assets/fonts/Inter-OFL.txt). Appen henter ikke skrifttypen fra en ekstern fonttjeneste.

| Fil eller mappe | Formål |
| --- | --- |
| `index.html`, `styles.css`, `brand.css` | Ramme, responsivt layout og det nye designsystem |
| `app.js`, `panels.js`, `experience.js` | Navigation, formularer og sammenhængende visninger |
| `domain.js`, `directory-domain.js` | Beregninger, validering og registerimport |
| `directory-ui.js` | Vogn-/kollegaregister og dets dialoger |
| `domain.test.js`, `directory-domain.test.js` | Beregnings- og datatests |
| `assets/brand/`, `assets/fonts/` | Leveret grafik og lokal Inter med licens |
| `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `sw.js` | Installation og offlinefiler |
| `serve.mjs`, `check.mjs` | Lokal server og syntakskontrol |

Lokalserveren tilføjer en Content Security Policy uden inline scripts eller `eval`. GitHub Pages understøtter ikke projektets egne HTTP-overskrifter. Hemmeligheder og private registre skal ikke ligge i klientkoden. Lokale browserdata kan læses af brugeren af den pågældende browserprofil.
