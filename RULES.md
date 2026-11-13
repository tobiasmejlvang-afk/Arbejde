# Beregningsprincipper

Dette dokument beskriver appens produktregler. Det er en registrering af de oplyste kontraktprincipper og valgte indstillinger, ikke juridisk rådgivning eller en fortolkning af en overenskomst.

## Tid

- En arbejdsuge løber mandag–søndag og identificeres med ISO-ugenummer og ISO-ugeår. Nytår kan derfor tilhøre det foregående eller næste ugeår.
- Arbejdstid er forskellen mellem start og slut. En sluttid før start regnes som arbejde over midnat til næste kalenderdag.
- Tid vises som timer/minutter; beregninger bruger decimaltimer. 12,33 timer svarer til 12 timer, 19 minutter og 48 sekunder.
- Flere registreringer på samme dato tæller som én arbejdsdag, og den daglige akkordgaranti tildeles kun én gang. Dagene vurderes kronologisk i ugen.
- En ekstra tømning eller anden opgave er en del af vagtens start/slut-tid. Den lægges ikke igen oven i arbejdstiden. Angiv hele vagtens faktiske tidsrum.

## Arbejdsordninger

| Ordning | Normaldage pr. uge | Daglig grænse | Betaling under grænsen |
| --- | --- | --- | --- |
| 3-dages akkord | 3 | 12,33 timer | Daglig akkordgaranti på 12,33 timer |
| 4-dages akkord | 4 | 9,25 timer | Daglig akkordgaranti på 9,25 timer |
| 5-dages timeløn | 5 | Mandag–torsdag 7,4 timer, fredag 7,0 timer | Kun faktisk arbejdstid |

På normale arbejdsdage er faktisk arbejdstid over dagsgrænsen overarbejde. Ved 3- og 4-dages akkord er alle faktiske arbejdstimer på efterfølgende arbejdsdage i samme uge overarbejde. Lørdag og søndag i 5-dagesordningen behandles som overarbejde. Fravær og planer opretter ikke i sig selv faktisk arbejdstid eller en akkordgaranti.

De angivne standarder giver henholdsvis **36,99**, **37,00** og **36,60** normale timer om ugen. Appen ændrer ikke stiltiende disse tal til 37. Jobbets ordning kan vælges i appen. De præcise dagsgrænser ligger i `domain.js`; brug af andre grænser kræver en kodeændring og nye beregningstests.

Ordninger og satser tilhører det valgte job. Registreringer fra forskellige jobs skal vurderes efter deres egne kontraktindstillinger. Rettelser i en registrerings dato, job, tid eller arbejdsordning kan ændre ugefordelingen og dermed andre registreringers beregnede overarbejde.

## Ekstra tømninger og andet arbejde

Begge opgavetyper gemmer tidsforbrug og de tilknyttede driftsoplysninger. Tidsforbruget indgår i vagtens allerede registrerede arbejdstid. Et markering af **med overarbejdsbetaling** omklassificerer den angivne tid til betalt overarbejde; den opretter ikke ekstra timer og giver ikke dobbeltbetaling for tid, der allerede er over dagsgrænsen. Markering af **uden overarbejdsbetaling** tilføjer ingen særskilt overarbejdsbetaling. Dagsgrænsens almindelige overarbejde beregnes fortsat efter ordningen.

Ekstratid kan samlet ikke overstige vagtens faktiske tid. Hvis noget arbejde foregår efter den oprindelige sluttid, skal vagten forlænges. Kørsel fra/til, adresser og containere er driftsoplysninger; de genererer ikke selv kilometerpenge, minuttillæg eller andre satser.

## Løn og kontraktoplysninger

- Alle beløb er **estimeret brutto**, før skat, ATP og andre fradrag.
- Begge overarbejdssatser er fulde timesatser i kroner. Ved manuel fordeling angives hele minutter på sats 2 i registreringen. Appen fordeler højst den beregnede overarbejdstid til sats 2 og bruger sats 1 til resten. Hvis en anvendt sats mangler, er lønestimatet ufuldstændigt.
- Ved **ATL · fast normal arbejdstid** bruger appen normal dato, start og slut fra registreringen samt den faktiske vagt. Minutter uden en sikker sats markeres til kontrol. En angivet pauseplacering trækkes fra det relevante tidsrum. Hvis kun pausens længde er angivet og vagten rammer flere satser, trækkes pausen fra de højeste satser først, og appen beder om kontrol.
- Normal start og slut på jobbet bruges som forslag ved nye registreringer. Fordelingen på tidligere registreringer bruger de tider, der er gemt på den enkelte vagt.
- Ukendte satser sættes til 0. Indtast satserne fra kontrakten, før løn-estimatet bruges.
- Akkordgaranti er betalt normaltid; registrerede faktiske timer og betalte timer kan være forskellige.
- Pension og frivalgsopsparing vises ud fra de gemte satser som særskilte estimater. Jobbet kan bruge bruttoløn alene eller bruttoløn med ferie- og frivalgsopsparing som pensionsgrundlag. Arbejdsgiverpension er ikke kontant lønudbetaling. Kontrollér beregningsgrundlag og satser mod kontrakten.
- Lønperioder og udbetalingsdatoer følger jobbets indstillinger. Visninger filtrerer efter den valgte dato eller periode. En beregning kan bruge andre dage i samme uge til korrekt afgørelse af ekstra arbejdsdage.
- Et job kan gemme oplysninger om ansættelse, ferie og sygdom. Appen opfinder ikke feriesaldi, optjening, sygeløn eller overenskomstbestemte rettigheder.
- En importeret lønprofil opdaterer de valgte kontraktfelter på et eksisterende job efter gennemgang. En eventuel note om en opgjort saldo gemmes som kontraktnote.

## Fravær, planer og rettelser

Sygdom, anden fraværsdag, fridag, ferie og feriefridag registreres særskilt. De indgår i kalenderen og fraværsoversigten. En fraværsdag er ikke en faktisk arbejdet dag. Uden en udtrykkeligt konfigureret betalingsregel giver den ikke automatisk løn, akkord eller overarbejde.

Arbejdsplaner er forventninger. De tæller først som faktisk arbejde, når en arbejdsregistrering er oprettet. Lønningsdage i kalenderen er baseret på de gemte jobindstillinger og er vejledende.

Registreringer kan redigeres og slettes. Overblik, kalender og arbejdsliste bruger samme lokale datasæt og genberegnes efter rettelser. Eksporter en JSON-sikkerhedskopi inden større ændringer. Der findes ingen serverhistorik eller automatisk gendannelse fra skyen.
