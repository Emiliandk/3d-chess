3D CHESS · EMILIAN
================

En opdatering af det eksisterende chess.emilian.dk med et rigtigt 3D-bræt,
Staunton-brikker, træmaterialer og en varm biblioteksbaggrund.
2D-visningen er fjernet. Skakreglerne omfatter også remis og gemte partier.

BETJENING
---------
- Klik på en brik, og klik på et lovligt destinationsfelt for at flytte.
- Hold museknappen nede og træk for at dreje 360 grader og ændre højdevinklen.
- Rul med musehjulet for at zoome. Kameraet holdes over bordet.
- På touch: Træk med én finger; knib med to fingre for at zoome.
- Spilvisning giver brættet mere plads og vælges som udgangspunkt på mobil.
  Rumvisning viser bordet og omgivelserne. Begge visninger kan drejes frit.
- Partiet og dine valg gemmes automatisk lokalt i denne browser. Vælg Fortsæt
  dit parti efter genindlæsning. En ny start eller farveskift kræver bekræftelse,
  når der er spillet træk. Fortryd og bondeforvandling bevares efter gendannelse.
  Hvis browseren afviser lagring, vises en besked; spillet kan stadig fortsætte.
- Nulstil visning vender tilbage til spillerens side og tilpasser brættet.
- Fuldskærm under brættet viser hele spillet, inklusive sidepanel og dialoger.
  Brug Afslut fuldskærm eller Esc for at vende tilbage. Spillet fortsætter uden
  genindlæsning. Knappen vises kun, når browseren tillader Fullscreen API.
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
Fortryd, nyt spil og ændret søgedybde annullerer igangværende analyser, og
forældede svar får ikke lov at ændre en nyere stilling.
Nye partier starter ved søgedybde 3. De seks valg går op til dybde 18 og er
søgeindstillinger, ikke Elo-niveauer. Stockfish kan stadig spille stærkt på
laveste indstilling. Gemte partier bevarer deres valgte søgedybde.

REMIS
-----
Pat og utilstrækkeligt materiale afslutter partiet automatisk. Ved tredje
gentagelse eller 50 træk uden bondetræk eller slag kan spilleren kræve remis,
også på grundlag af et påtænkt lovligt træk. Det påtænkte træk udføres ikke.
Femte gentagelse og 75 træk uden bondetræk eller slag giver automatisk remis;
skakmat har forrang. Computeren kræver remis, når muligheden opstår.
Gentagelse tager højde for tur, rokaderettigheder og lovlig en passant.
Materialekontrollen omfatter bare konger, én løber eller springer mod en bar
konge og stillinger med kun konger og løbere på samme feltfarve. Den afgør
ikke alle tænkelige døde stillinger, eksempelvis låste bondeformationer.
Regelgrundlag: https://handbook.fide.com/chapter/E012023, artikel 5 og 9.

KONTROL UDFØRT 8. SEPTEMBER 2026
------------------------------
- 53 automatiske tests består, inklusive gemning og atomisk gendannelse,
  rokade, en passant, bondeforvandling, remis, fortryd og forældede motorsvar.
- Seks integrationstests kører main.js med de rigtige spil- og lagringsmoduler.
  De kontrollerer genoptagelse, nulstilling, farveskift og annullering. DOM,
  renderer og motorsvar er testdoubler; dette er ikke en WebGL-browserkontrol.
- Kameraberegninger kontrollerer Spilvisning og Rumvisning, smalle formater,
  flere synsvinkler og størrelsesændring. De erstatter ikke visuel WebGL-QA.
- Et levende API-kald ved søgedybde 3 gav et lovligt svar ved den valgte dybde.
- Den åbne grafikkontrol nedenfor gælder fortsat denne ændring.

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

KONTROL AF FULDSKÆRM
-------------------
Fuldskærmsknappen er afprøvet i kontrolbrowseren med rigtig Fullscreen API:
indgang, udgang via knappen og Esc, korrekt knaptekst og aria-pressed.
Brætområdet og sidepanelet holder sig inden for desktopvisningen; på smalle
skærme kan siden rulles som normalt. Mobilbredde er kontrolleret uden vandret
overløb. I en ramme uden tilladelse til fuldskærm skjules knappen korrekt.
De 15 eksisterende spil- og geometritests består. Fuldskærm er kontrolleret
i WebGL-fejltilstanden; selve 3D-renderingen er fortsat utilgængelig her.

ÅBEN KONTROL FØR LIVE
--------------------
Kontrolbrowserens WebGL er deaktiveret. Derfor er den færdige WebGL-scene,
materialernes endelige udseende, faktisk musestyring og touch endnu ikke visuelt
eller interaktivt godkendt i en browser med grafikadgang. Afprøv grenens preview
på desktop og mobil før merge til main. Den nye kode er ikke en 2D-fallback:
mangler WebGL, vises en forklaring, og spilkontrollerne deaktiveres.

FILER OG RETTIGHEDER
-------------------
index.html, style.css, main.js: brugerflade.
game.js: skakregler, remis, gendannelse og Chess-API-adapteren.
game-storage.js: lokal lagring med fejlhåndtering.
scene.js, board.js, camera.js: 3D-scene, fysisk spilleflade, klik og kamera.
fullscreen.js: browserens fuldskærmsfunktion, uafhængigt af skakmotoren.
assets/: konverterede modeller, træteksturer og genereret biblioteksbillede.
vendor/: Three.js r180 med relative modulimporter og original MIT-licens.
tests/: testforløb med tydeligt deklarerede simulerede API-svar.
credits.html og assets/ASSET-SOURCES.txt: kilder, bearbejdning og licenser.
Brikkernes MIT-licens og Three.js-licensen skal følge med ved deling.
Træteksturer er CC0. Biblioteksbilledet er AI-genereret; prompten følger med.
