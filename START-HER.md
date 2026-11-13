# Start her · Arbejde 3

## 1. Gør dit job klar

Åbn **Job & kontrakt**, vælg din arbejdsuge, og udfyld satserne fra kontrakten. Udfyld begge overarbejdssatser som fulde beløb pr. time, hvis din kontrakt bruger to satser. Tilføj eventuelt dit private vogn-/kollegaregister under **Vogn & kollegaer**. Ukendte lønsatser giver ikke et færdigt lønestimat.

Har du en privat Arbejde-lønprofil, skal du åbne **Job & kontrakt → Importér lønprofil**, vælge JSON-filen og udpege dit eksisterende job. Tryk **Gennemgå vilkår**, sammenlign værdierne og vælg **Gem lønvilkår**. Appen beholder jobbets registreringer og genberegner deres lønoverslag med de importerede vilkår. En eventuel note med daterede saldi vises i kontraktnoterne.

## 2. Hent din arbejdsplan ind

Åbn **Importér arbejdsplan**, og vælg PDF-filerne på din enhed. Appen læser NVF-ugeplanernes tabel lokalt; PDF-filerne uploades ikke. PDFen skal have tekstlag. Scannede sider kræver tekstgenkendelse uden for appen.

Vælg job og derefter **én person eller én vogn**. Gennemgå datoer, navnematch, opgaver og tider. Åbn **Kontrollér / ret** ved usikre rækker. Vælg de ønskede vagter, bekræft kontrolpunkterne, og tryk **Tilføj vagter**. Kun dit valgte udsnit tilføjes til kalenderen.

Markér **Brug dette valg til min daglige visning**, hvis appen skal huske personen eller vognen. Personnoter bliver ikke automatisk til fravær. En vagt uden tider forbliver en heldagsplan. Kalenderplaner giver først faktiske timer eller løn, når du gemmer en arbejdsregistrering.

## 3. Registrér dagen enkelt

Åbn **Arbejdstid**, og start timeren, når arbejdet begynder. Brug pause og fortsæt efter behov. Timerens status gemmes i samme browser og kan gendannes efter genindlæsning.

Stop timeren ved arbejdsdagens afslutning. Gennemgå start/slut, pause, vogn, tur og bemanding i formularen, og gem dagen. Du kan også indtaste tider manuelt. Tidligere arbejdsdage kan rettes under **Registreringer**.

Med **Manuel fordeling** angiver du minutter på sats 2. Appen bruger sats 1 til resten af overarbejdet. Med **ATL · fast normal arbejdstid** skal du kontrollere vagtens normale start og slut, så appen kan foreslå fordelingen. Du kan gemme normal start og slut som standard under jobbet og rette tiderne for den enkelte vagt. Kontrollér pause og eventuelle advarsler, før du gemmer.

Ekstra tømninger og andre opgaver ligger inden for vagtens start/slut. De tilføjer ikke den samme tid en ekstra gang.

Under **Indstillinger → Avancerede indstillinger** kan du vælge tema, menuplacering og startside og tilpasse, hvilke værktøjer du ser.

## 4. Gem en kopi og brug dine enheder

Tag en JSON-backup under **Indstillinger**. Den indeholder gemte registreringer, planer, register, personlige valg og henvisninger til billeder. Billedfiler og den igangværende timer gemmes separat. Stop, gennemgå og gem dagen før flytning af data.

Log ind med samme konto under **Indstillinger → Login og synkronisering** på Windows og Samsung-tablet. Brug **Kopiér lokale data til kontoen**, hvis du allerede har registreringer på enheden. Gemte ændringer synkroniseres, når enheden er online. Browserprofiler og den lokale HTML-fil har hver deres lokale lagring. Bruger du appen uden konto, kan du flytte registreringerne med JSON-eksport og -import.

Brug [HTTPS-appen](https://tobiasmejlvang-afk.github.io/Arbejde/) og installer den fra browserens menu. Den lokale HTML-kopi kan kræve internet første gang PDF-læserens filer indlæses. Dine PDF-data bliver på enheden. Opbevar private PDFer, registre, JSON- og CSV-filer privat; de hører ikke til i offentlig kildekode eller offentlige udgivelser.

For at tage en hentet opdatering i brug skal du gemme eventuelle åbne registreringer, lukke alle Arbejde-faner og appvinduer og åbne appen igen. Opdatér begge enheder, før du synkroniserer registreringer med de nye satser og indstillinger.

Vil du starte fra kildekoden, kræves Node.js 22.13 eller nyere. Kør `npm start`, og åbn adressen, som terminalen viser. Flere detaljer findes i [README.md](README.md).
