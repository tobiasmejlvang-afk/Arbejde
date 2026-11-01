# Start her · Arbejde 3

## 1. Gør dit job klar

Åbn **Job & kontrakt**, vælg din arbejdsuge, og udfyld satserne fra kontrakten. Tilføj eventuelt dit private vogn-/kollegaregister under **Vogn & kollegaer**. Ukendte lønsatser giver ikke et færdigt lønestimat.

## 2. Hent din arbejdsplan ind

Åbn **Importér arbejdsplan**, og vælg PDF-filerne på din enhed. Appen læser NVF-ugeplanernes tabel lokalt; PDF-filerne uploades ikke. PDFen skal have tekstlag. Scannede sider kræver tekstgenkendelse uden for appen.

Vælg job og derefter **én person eller én vogn**. Gennemgå datoer, navnematch, opgaver og tider. Åbn **Kontrollér / ret** ved usikre rækker. Vælg de ønskede vagter, bekræft kontrolpunkterne, og tryk **Tilføj vagter**. Kun dit valgte udsnit tilføjes til kalenderen.

Markér **Brug dette valg til min daglige visning**, hvis appen skal huske personen eller vognen. Personnoter bliver ikke automatisk til fravær. En vagt uden tider forbliver en heldagsplan. Kalenderplaner giver først faktiske timer eller løn, når du gemmer en arbejdsregistrering.

## 3. Registrér dagen enkelt

Åbn **Arbejdstid**, og start timeren, når arbejdet begynder. Brug pause og fortsæt efter behov. Timerens status gemmes i samme browser og kan gendannes efter genindlæsning.

Stop timeren ved arbejdsdagens afslutning. Gennemgå start/slut, pause, vogn, tur og bemanding i formularen, og gem dagen. Du kan også indtaste tider manuelt. Tidligere arbejdsdage kan rettes under **Registreringer**.

Ekstra tømninger og andre opgaver ligger inden for vagtens start/slut. De tilføjer ikke den samme tid en ekstra gang.

## 4. Gem en kopi og brug dine enheder

Tag en fuld JSON-backup under **Indstillinger**. Den indeholder gemte registreringer, planer, register og personlige valg. **En timer, der endnu ikke er gemt som arbejdsdag, er ikke med.** Stop, gennemgå og gem dagen før flytning af data.

Windows, Samsung-tablet, lokal HTML og forskellige browserprofiler har hver deres lagring. Brug JSON-eksport/import til flytning; der er ingen automatisk synkronisering. CSV er til regneark, ikke gendannelse.

Brug [HTTPS-appen](https://tobiasmejlvang-afk.github.io/Arbejde/) og installer den fra browserens menu. Den lokale HTML-kopi kan kræve internet første gang PDF-læserens filer indlæses. Dine PDF-data bliver på enheden. Opbevar private PDFer, registre, JSON- og CSV-filer privat; de hører ikke til i offentlig kildekode eller offentlige udgivelser.

Vil du starte fra kildekoden, kræves Node.js 22.13 eller nyere. Kør `npm start`, og åbn adressen, som terminalen viser. Flere detaljer findes i [README.md](README.md).
