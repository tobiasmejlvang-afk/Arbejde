# Egne kort og UI-komponenter

Åbn **Indstillinger → Egne komponenter**. Vælg en kortskabelon, eller opret et felt, en liste, en boks eller vektorgrafik. Titler, beskrivelser og linjer er redigerbar tekst. Skabelonerne indeholder SVG-ikoner og udseendet **Metal & orange** inspireret af de leverede kortreferencer.

- Placeringer: Chaufførkort, Vognkort, Turkort, Kørsel & Bemanding, Vogne & Ture og Turopsætning.
- Ved chauffør-, vogn- og turkort kan du vælge alle kort af typen eller ét bestemt kort. Tilføj chauffører og vogne i registeret og ture under Ture, før du vælger et bestemt kort.
- Vælg lille, mellem eller stor, bredt kort eller flise, farve og udseende. Forhåndsvisningen opdateres under redigering. Vælg **Opret komponent** eller **Gem ændringer** for at gemme.
- Eksportér komponenter som JSON, og importér filen igen efter gennemgang. Import tilføjer komponenter og bevarer de eksisterende. Sammenfaldende komponent-id'er får nye id'er. En komponent bundet til et bestemt kort bruger kortets id; ved import til et andet register kan du vælge det nye kort i editoren.
- SVG-import understøtter former og kurver, højst 64 KiB og 250 elementer. Tekst indtastes i editorens felter. Scripts, HTML, CSS, animationer og eksterne referencer afvises. PNG-referencer kan bruges som designforlæg; teksten i et PNG-billede er ikke redigerbare felter.

Komponenterne ligger i `uiComponents` i appens normale datasæt. De følger med i JSON-backup og eksisterende Supabase-kontosynkronisering. Der kræves ingen ændring af databasens tabeller.

Eksempel på en importfil:

```json
{
  "type": "arbejde-ui-components",
  "version": 1,
  "components": [{
    "id": "eksempel-vognkort",
    "target": "vehicle-card",
    "entityId": "",
    "type": "box",
    "title": "Vognoplysninger",
    "value": "Redigér oplysningerne i appen",
    "items": ["Vognnummer: —", "Registreringsnummer: —", "Fast chauffør: —"],
    "size": "large",
    "variant": "metallic",
    "color": "orange",
    "icon": "vehicle",
    "layout": "wide",
    "svg": ""
  }]
}
```

Ved opdatering af en installeret PWA: luk alle åbne appfaner og åbn appen igen, så den nye offlineversion overtager.
