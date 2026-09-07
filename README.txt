3D SKAK · EMILIAN
================

En opdatering af det eksisterende chess.emilian.dk med et rigtigt 3D-bræt,
Staunton-brikker, træmaterialer og en varm biblioteksbaggrund.
2D-visningen er fjernet. De oprindelige skakregler og FEN-rettelsen er bevaret.

BETJENING
---------
- Klik på en brik, og klik på et lovligt destinationsfelt for at flytte.
- Hold museknappen nede og træk for at dreje 360 grader og ændre højdevinklen.
- Rul med musehjulet for at zoome. Kameraet holdes over bordet.
- På touch: Træk med én finger; knib med to fingre for at zoome.
- Nulstil visning vender tilbage til spillerens side og tilpasser brættet.
- På det fokuserede bræt: Piletaster vælger felter, Enter/mellemrum vælger/flytter,
  Escape fjerner markering, Skift+piletaster drejer kameraet, +/- zoomer, R nulstiller.
  Piletaster følger brættets koordinater, også når kameraet er drejet.

START OG HOSTING
---------------
Appen er fortsat statisk og har ingen egen backend eller hemmelige nøgler.
Alle filer og mapper skal med på webhosten, inklusive assets/ og vendor/.
index.html kan ikke længere stå alene eller åbnes direkte med file://.
Til lokal udvikling: Node.js 22+ og kommandoen npm run dev.
Ingen npm-installation er nødvendig; 3D-bibliotekerne følger med i vendor/.
Åbn derefter http://localhost:4173 i din egen browser.
Vercel-konfigurationen serverer projektmappen som statiske filer.

MOTOR
-----
Stockfish leveres via https://chess-api.com/v1 som i den eksisterende app.
Internet er nødvendigt, når computeren skal trække. Kun den aktuelle FEN-stilling
og analyseindstillinger sendes. Der følger ingen lokal Stockfish-motor med.
Fejl fra API'et vises med mulighed for at prøve samme stilling igen.
Fortryd, nyt spil og ændret motorstyrke annullerer igangværende analyser, og
forældede svar får ikke lov at ændre en nyere stilling.

KONTROL UDFØRT 7. SEPTEMBER 2026
------------------------------
- 15 automatiske kontroller: spil/FEN, API-kontrakt og fejl, ugyldige motorsvar,
  fortryd, annullering af gamle svar, rokade, en passant, bondeforvandling,
  skakmat og kameratilpasning ved mobil-, tablet- og desktopformat.
- Brættets 64 felter kontrolleres mod hele brætgeometrien fra 17 synsretninger.
  Testen omfatter feltfarver, fuld 8 x 8-dækning og skjulte felter under rammen.
- Alle seks GLB-brikker kan indlæses med den medfølgende GLTFLoader.
- Et levende API-kald efter 1. e4 gav det lovlige svar e7e5 ved dybde 9.
- Browserkontrol af DOM, fejltilstand og layout ved smalle bredder og 200 % tekst.

RETTELSE AF FELTER OG OMGIVELSER
------------------------------
Træpladens overside lå før over felterne og skjulte dem. Felterne er nu fysiske
fliser over messingunderlaget og trærammen. Brikker og markeringer bruger samme
definerede højde for spillefladen. Genindsættelse af de tidligere højder i en
lokal kontrol genskabte fejlen, hvor trærammen bliver ramt før feltet.
Biblioteksbaggrunden er genskabt ud fra brugerens nye reference: mørkt træ,
marmorpejs, globus, lampe med sort skærm og en brun læderstol. Det er en
genereret panoramafortolkning; den endelige beskæring og samling af panoramaet
mangler fortsat visuel kontrol i WebGL.

ÅBEN KONTROL FØR LIVE
--------------------
Kontrolbrowserens WebGL er deaktiveret. Derfor er den færdige WebGL-scene,
materialernes endelige udseende, faktisk musestyring og touch endnu ikke visuelt
eller interaktivt godkendt i en browser med grafikadgang. Afprøv grenens preview
på desktop og mobil før merge til main. Den nye kode er ikke en 2D-fallback:
mangler WebGL, vises en forklaring, og spilkontrollerne deaktiveres.

De oprindelige remisbegrænsninger er bevaret: pat registreres, men gentagelse,
50-træksreglen og utilstrækkeligt materiale er ikke implementeret.

FILER OG RETTIGHEDER
-------------------
index.html, style.css, main.js: brugerflade.
game.js: de eksisterende regler og Chess-API-adapteren.
scene.js, board.js, camera.js: 3D-scene, fysisk spilleflade, klik og kamera.
assets/: konverterede modeller, træteksturer og genereret biblioteksbillede.
vendor/: Three.js r180 med relative modulimporter og original MIT-licens.
tests/: testforløb med tydeligt deklarerede simulerede API-svar.
credits.html og assets/ASSET-SOURCES.txt: kilder, bearbejdning og licenser.
Brikkernes MIT-licens og Three.js-licensen skal følge med ved deling.
Træteksturer er CC0. Biblioteksbilledet er AI-genereret; prompten følger med.
