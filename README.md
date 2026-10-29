# Arbejde

En personlig, dansk app til registrering af arbejdstid, renovationsture, ekstra tømninger, andet arbejde og fravær. Appen har et mørkt design og tilpasser sig Windows-computer og Samsung-tablet.

## Start lokalt

Installer Node.js 20 eller nyere. Åbn en terminal i projektmappen og kør:

```sh
npm start
```

Åbn derefter [http://127.0.0.1:4173](http://127.0.0.1:4173). Projektet har ingen eksterne pakker, så `npm install` er ikke nødvendigt. Kildekoden består af HTML, CSS og JavaScript-moduler.

Kontroller beregninger og syntaks med:

```sh
npm test
npm run check
```

Hvis tabletten skal åbne den lokale server på samme netværk, kan serveren bindes til netværket. I PowerShell:

```powershell
$env:HOST = '0.0.0.0'
npm start
```

Åbn computerens lokale IP-adresse med port 4173 på tabletten. Det kræver, at computerens firewall tillader forbindelsen. Installation og offlinefunktion kræver en sikker adresse: HTTPS eller localhost. Brug GitHub Pages til almindelig brug på begge enheder.

## Udgiv på GitHub Pages

1. Læg projektfilerne i roden af `tobiasmejlvang-afk/Arbejde` og commit til `main`.
2. Åbn repositoryets **Settings → Pages**.
3. Vælg **Deploy from a branch**, derefter **main** og **/ (root)**, og gem.
4. Når GitHub har udgivet siden, åbnes den på [tobiasmejlvang-afk.github.io/Arbejde/](https://tobiasmejlvang-afk.github.io/Arbejde/).

Alle appfiler bruger relative stier og fungerer under `/Arbejde/`. Der kræves ingen bygning, API-nøgler eller serverdatabase. Tilgængeligheden af GitHub Pages afhænger af repositoryets synlighed og kontoens plan.

## Installer på dine enheder

På Windows: Åbn den udgivne HTTPS-adresse i Edge eller Chrome. Brug browserens installationsikon i adresselinjen eller menuen til at installere siden som app.

På Samsung-tablet: Åbn samme HTTPS-adresse i Chrome, og vælg **Installer app** eller **Føj til startskærm** i menuen. Den præcise menutekst afhænger af browserens version.

Appen gemmer de nødvendige filer til offlinebrug efter første vellykkede åbning. Ved udgivelser kontrollerer den for opdateringer; online hentes appfiler på ny. Ændr cacheversionen i `sw.js`, når du udgiver ændrede appfiler. En åbnet app kan kræve genindlæsning for at tage en ny version i brug.

## Dine oplysninger og sikkerhedskopier

Registreringer gemmes lokalt i den browserprofil, hvor du bruger appen. Der er ingen cloudkonto, backend eller automatisk synkronisering mellem computer og tablet. Brug JSON-eksport i **Indstillinger** til sikkerhedskopi og JSON-import på den anden enhed til at flytte oplysningerne. Behandl en import som en gendannelse af data, og læs importdialogen, før du bekræfter.

Tag jævnligt en sikkerhedskopi. Sletning af browserdata, privat browsing eller skift til en anden browserprofil kan fjerne eller skjule lokale registreringer. Undlad at committe eksporter med personlige oplysninger til GitHub. Appens projektfiler indeholder ingen virkelige persondata.

## Kom godt i gang

1. Opret et **Job**, vælg din arbejdsuge, og udfyld kontraktens satser og lønperiode.
2. Opret de vogne, ture og opgaver, som du bruger i hverdagen.
3. Brug **Daglig registrering** til start/slut, tur, bemanding, tømninger og affaldstyper. Ekstra tømninger og andet arbejde knyttes til registreringen.
4. Tilføj arbejdsplaner og fravær, og se registreringer og løndage i **Kalender**.
5. Se periodens eller månedens tal i **Overblik**. Eksisterende registreringer kan åbnes og rettes.

## Beregninger og afgrænsning

Løn er et estimat af bruttobeløb før skat og øvrige fradrag. Ukendte lønsatser starter på 0 og skal udfyldes fra din kontrakt. Appen erstatter ikke en lønseddel. Pension, frivalg og fravær anvender dine indstillinger; appen antager ingen lovbestemte satser, rettigheder eller feriesaldi.

De forudindstillede uger følger de angivne dagstal: 3 × 12,33 = 36,99 timer, 4 × 9,25 = 37 timer og 4 × 7,4 + 7,0 = 36,6 timer. Derfor svarer 3- og 5-dagesordningerne ikke præcist til 37 timer. Du kan vælge ordning på job og registrering; de præcise dagsgrænser er defineret i `domain.js` og skal ændres dér, hvis kontrakten bruger andre tal. 12,33 er decimaltimer, ikke 12 timer og 33 minutter.

Læs de fulde beregningsprincipper og afgrænsninger i [RULES.md](RULES.md), inden du sammenholder estimater med lønsedler.

## Projektstruktur

| Fil | Formål |
| --- | --- |
| `index.html`, `styles.css` | Appens ramme og responsive design |
| `app.js`, `panels.js` | Navigation, formularer, lokal lagring og visninger |
| `domain.js` | Rene beregninger og datavalidering |
| `domain.test.js` | Test af arbejdstid, uger og lønberegning |
| `manifest.webmanifest`, `icon.svg`, `sw.js` | Installation og offlinefiler |
| `serve.mjs` | Lokal webserver med sikkerhedsoverskrifter |

Lokalserveren tilføjer en Content Security Policy uden inline scripts eller `eval`. GitHub Pages understøtter ikke projektets egne HTTP-overskrifter; undgå derfor at tilføje tredjepartsscripts eller hemmeligheder til klientkoden. Alle data i en browserapp kan læses af brugeren af den pågældende browserprofil.
