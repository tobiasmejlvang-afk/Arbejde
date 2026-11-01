# Lokal PDF.js-runtime

Pinned **pdfjs-dist 6.4.299**, den stabile Mozilla-udgivelse verificeret 1. november 2026 på [Mozillas downloadside](https://mozilla.github.io/pdf.js/getting_started/) og [npm](https://www.npmjs.com/package/pdfjs-dist).

Filerne er kopieret uændret fra den officielle npm-pakke. Tarballens SHA-512 er kontrolleret mod npm-registerets `dist.integrity`; nøjagtig kilde, version, integritet og filer står i [provenance.json](provenance.json). Mozilla-kilde: [v6.4.299](https://github.com/mozilla/pdf.js/releases/tag/v6.4.299).

- `pdf.min.mjs` og `pdf.worker.min.mjs`: matchende officielle **legacy/build** ESM-filer med kompatibilitetspolyfills. Ingen egen ændring af vendor-koden.
- `cmaps/`: komprimerede tegnkort og tilhørende licens.
- `standard_fonts/`: fallback-fontdata og deres medfølgende licenser.
- [LICENSE](LICENSE): Apache License 2.0 for PDF.js. Bevar også font- og tegnkortlicenserne ved distribution.

Der leveres ingen PDF-filer, private skemaer eller OCR-model. Denne runtime bruges til tekst og formularværdier, ikke siderendering eller JavaScript i PDF-dokumenter. `isEvalSupported`, XFA og Wasm er slået fra. Eksterne links, scripts og vedhæftninger i PDFen køres ikke.

## API og koordinater

```js
import {extractPdf, PDF_LIMITS} from './pdf-reader.js';
const result = await extractPdf(file, {
  signal: abortController.signal,
  onProgress: ({phase, percent, message}) => { /* Opdater status i brugerfladen. */ }
});
```

Importstien ovenfor gælder fra appens rod. APIet returnerer `{pages, fingerprint, filename, pageCount, warnings}`. Hver side har `{pageNumber, width, height, items, suppressedItems}`. Sidetal er 1-baserede; mål og koordinater er viewport-punkter ved skala 1 efter PDFens rotation og beskæring. `x` peger mod højre og `y` nedad fra øverste venstre hjørne. Tekstbokse bruger fontens ascent/descent og er en tilnærmelse til synlige glyph-grænser.

Items er `{text, x, y, width, height, origin}`. Udfyldte AcroForm-widgets har `origin: 'annotation'`, `fieldName` og `fieldType`. Normale tekstitems har `origin: 'text'`. En entydigt indeholdt, kort baggrundslinje kan erstattes af feltets værdi og bevares i `suppressedItems` med `supersededBy`. Ved delvist overlap eller overlappende felter bevares begge værdier med `needsReview: true` og en advarsel. Highlights og popups skaber ingen tekstkandidater.

Fingerprint er SHA-256 af de oprindelige filbytes, hvor Web Crypto er tilgængeligt, ellers PDF.js-dokumentets identifikator med præfikset `pdfjs:`. Der logges ikke PDF-tekst eller navne. Der er grænser på 20 MiB, 30 sider, tekstmængde og 120 sekunders læsetid. Abort giver `AbortError`/`ABORTED`. Adgangskodebeskyttelse giver `PDF_PASSWORD_REQUIRED`; brugeren skal vælge en ubeskyttet kopi. Scannede/tomme sider markeres, og en helt tekstløs fil giver `PDF_NO_TEXT`.

## Netværk og offlinebrug

PDF-bytes gives direkte fra browserens File API til læseren og uploades ikke. I webappen hentes kun de lokale runtimefiler fra appens egen adresse. Den selvstændige HTML-fil kan hente de statiske runtimefiler fra den samme officielle appudgivelse; den sender stadig ingen PDF-data. Denne første indlæsning kræver internet. Worker, tegnkort og fontdata skal være tilgængelige på samme udgivelse.

Appens service worker bør cache de to ESM-filer og standardfontdata og understøtte runtime-cache af `cmaps/`. Den anvendte tekstlæser anmoder ikke om Wasm eller billeddekodere. Der er ingen CDN-afhængighed under normal webappdrift. `pdfAssetBase()` vælger selv lokal filadresse i Node, appens lokale assetmappe i ESM og den udgivne assetadresse for browserens selvstændige HTML-kopi.

## Kontrol

`node --test pdf-reader.test.js` kører reelle syntetiske PDF-filer gennem samme motor og kontrollerer tekst, koordinater, AcroForm-overlap, fingerprint, sidegrænse, afbrydelse og læsefejl. Der er ingen private dokumenter i testen. Node 22.13+ eller 24+ kræves af denne PDF.js-version; Node 24 er brugt til lokal kontrol. Motoren kan i Node advare om manglende valgfri `@napi-rs/canvas`, DOMMatrix og Path2D til **rendering**; tekstudtræk bruger dem ikke, og de faktiske private input er kontrolleret uden disse pakker. Browseren har sine egne native DOM-/Canvas-APIer.
