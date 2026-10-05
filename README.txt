3D CHESS · EMILIAN
================

En opdatering af det eksisterende chess.emilian.dk med et rigtigt 3D-bræt,
Staunton-brikker, træmaterialer og en varm biblioteksbaggrund.
2D-visningen er fjernet. Skakreglerne omfatter også remis og gemte partier.

BETJENING
---------
- Klik på en brik, og klik på et lovligt destinationsfelt for at flytte.
- Du kan også gribe en af dine brikker med venstre museknap, trække den frit
  og slippe på et lovligt felt. Brikken følger musen, og destinationer markeres.
  Et ugyldigt slip returnerer brikken. Et kort klik bevarer klikbetjeningen.
- Træk på et tomt område, eller brug højre museknap for at dreje 360 grader
  og ændre højdevinklen. Kameraet holdes stille, mens du trækker en brik.
- Rul med musehjulet for at zoome. Kameraet holdes over bordet.
- På touch: Træk med én finger; knib med to fingre for at zoome.
- Spilvisning giver brættet mere plads og vælges som udgangspunkt på mobil.
  Rumvisning viser bordet og omgivelserne. Begge visninger kan drejes frit.
- Partiet og dine valg gemmes automatisk lokalt i denne browser. Vælg Fortsæt
  dit parti efter genindlæsning. En ny start eller farveskift kræver bekræftelse,
  når der er spillet træk. Fortryd og bondeforvandling bevares efter gendannelse.
  Hvis browseren afviser lagring, vises en besked; spillet kan stadig fortsætte.
- Under Backup af dit parti kan du hente en JSON-fil og gendanne den senere,
  også i en anden browser. Filen behandles lokalt og uploades ikke. Den gemmer
  spillede træk, farve, søgedybde, remisvalg og visning. Behold filen et sikkert
  sted. Et computertræk, der endnu ikke er modtaget, beregnes efter gendannelse.
  Filen kontrolleres før bekræftelse; annullering bevarer det nuværende parti.
- Nulstil visning vender tilbage til spillerens side og tilpasser brættet.
- Kameraet flyver automatisk 360 grader rundt om brættet på 90 sekunder.
  Pause drone stopper flyvningen, og Start drone genoptager fra den aktuelle
  vinkel. Flyvningen stopper ved input på brættet, visningsskift og nulstilling.
  Reduceret bevægelse slår den fra. Skjulte faner flyver ikke videre.
- Fuldskærm under brættet lader kun 3D-scenen fylde hele skærmen. Sidepanel,
  overskrifter og værktøjslinjer skjules. Esc vender tilbage til den normale
  visning. Spillet og droneflyvningen fortsætter uden genindlæsning. Nødvendige
  spildialoger kan stadig åbnes. Knappen vises kun, når Fullscreen API tillades.
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
Udviklingsserveren lytter kun på 127.0.0.1 og kan kun nås fra denne computer.
Det samme gælder npm start, som bruger Python 3 på port 4173.
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

VERSION 2.3.0 · 5. OKTOBER 2026
-----------------------------
- Musetræk af egne brikker på spillerens tur, også i fuldskærm og fra alle
  kameravinkler. Brikken følger gribepunktet og løftes lidt over brættet.
- Lovlige felter og den aktuelle destination markeres. Ugyldige slip uden
  for brættet eller canvas returnerer brikken uden at ændre partiet.
- Kamera og drone står stille under træk. Klikbetjening, rokade, slag,
  en passant, forvandling, fortryd og automatisk gemning bruger de samme regler.
- Afbrudt input, mistet fokus, skjult fane, størrelsesændring og en ændret
  stilling returnerer brikken. Gemte partier skal genoptages før briktræk.
- 102 automatiske tests består. Nye kontroller bruger rigtige kameraberegninger,
  raycasting, OrbitControls og skakregler samt en simuleret DOM-eventflade;
  de erstatter ikke manuel kontrol af musetræk og pointer capture i browseren.
- Manuel test af musetræk, fuldskærm, knapper, tastatur og mus/trackpad-scrolling
  i Polypane Workspace 1 afventer ejeren. Desktop er målplatformen.
- Ingen nye integrationer, credentials, afhængigheder eller OpenAI-containerkald
  er tilføjet. Hosted konfiguration og ekstern udbyders drift er uverificeret.

VERSION 2.2.1 · 5. OKTOBER 2026
-----------------------------
- Fuldskærm viser kun 3D-scenen uden header, sidepanel, overskrifter og
  værktøjslinjer. Brættets billedtekst og nødvendige spildialoger bevares.
- Brættet får fokus ved indgang. Esc afslutter, og fokus returnerer til
  fuldskærmsknappen. Den normale visning vender tilbage uden genindlæsning.
- De 92 eksisterende automatiske tests består. Manuel fuldskærmskontrol,
  knapper, tastatur og mus/trackpad i Polypane Workspace 1 afventer ejeren.
- Ingen nye integrationer, credentials eller OpenAI-containerkald er tilføjet.
  Hosted konfiguration og ekstern udbyders drift er fortsat uverificeret.

VERSION 2.2.0 · 5. OKTOBER 2026
-----------------------------
- Automatisk 360-graders kameraflyvning på 90 sekunder, bygget i den eksisterende
  Three.js-scene uden Spline, Figma, nye afhængigheder eller eksterne kald.
- Hele kamerabanen tilpasses på forhånd, så bræt og relevante bordgenstande
  bliver i billedet ved konstant afstand. Kameraet tegnes højst 30 gange/sekund.
- 92 automatiske tests består. De nye tests dækker en komplet omgang, kameramål,
  indramning ved desktopstørrelser, pause, genoptagelse, skjulte faner, reduceret
  bevægelse, størrelsesændring og den tilgængelige knap uden ændring af gemte spil.
- Lokal WebGL-indlæsning og desktoprendering er observeret uden konsolfejl.
  Manuel test af knapper, tastatur, mus/trackpad-scrolling og browserzoom i
  Polypane Workspace 1 afventer ejeren. Mobil-QA indgår ikke i denne ændring.
- Kildekoden og lokale env-filer er kontrolleret: ingen secret-værdier eller
  credential-bærende env-filer fundet; dronefunktionen bruger ingen credentials.
  Browserkode og fejl/logging i den undersøgte frontend indeholder ingen nøgler.
  Sites-secret-hentning er ikke relevant for denne statiske frontend; hosted
  konfiguration og den eksisterende Chess-API-udbyders backend er uverificeret.
- Ingen OpenAI API- eller containerkald findes i den undersøgte frontend.
  Ekstern udbyders interne drift, logging og containerbrug er uverificeret.

VERSION 2.1.0 · 1. OKTOBER 2026
-----------------------------
- 85 automatiske tests består, inklusive backup, ugyldige/for store filer,
  bekræftet og annulleret import, blokeret lagring og sene motorsvar.
- WebGL, tastaturtræk, et levende computersvar, download, annullering,
  gendannelse og genoptagelse er afprøvet i Chrome. Fire skærmstørrelser og
  200 % tekst på mobilbredde giver intet vandret overløb. Automatiseret
  tilgængelighedskontrol fandt ingen sikre fejl; kontrast kræver manuel kontrol.
- Den eksisterende lagringsnøgle og spilformat version 1 er bevaret.
- Ingen nye eksterne tjenester, credentials eller afhængigheder er tilføjet.
- Projektbackup og aktuel drifts-/QA-evidens opbevares i Chess-projektets Drive.
  Spilleres browserdata indgår ikke automatisk i projektbackuppen; brug Hent
  backup til at sikre det enkelte parti. Download er ikke cloud-synkronisering.

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

RESTERENDE KONTROL
-----------------
Den aktuelle Chrome-kontrol af WebGL og backup er beskrevet ved version 2.1.0.
De tidligere kontroller ovenfor er historiske. Fuld Polypane-kontrol, touch på
en fysisk enhed, skærmlæser, manuel kontrast og et helt parti kræver fortsat
afprøvning. Der er ingen 2D-fallback: mangler WebGL, vises en forklaring,
og spilkontrollerne deaktiveres.

FILER OG RETTIGHEDER
-------------------
index.html, style.css, main.js: brugerflade.
game.js: skakregler, remis, gendannelse og Chess-API-adapteren.
game-storage.js: lokal lagring med fejlhåndtering.
game-backup.js: lokal backup og validering ved genafspilning af træk.
scene.js, board.js, camera.js: 3D-scene, fysisk spilleflade, klik og kamera.
piece-drag.js: musetræk, gribepunkt, destination og afbrudt input.
fullscreen.js: browserens fuldskærmsfunktion, uafhængigt af skakmotoren.
assets/: konverterede modeller, træteksturer og genereret biblioteksbillede.
vendor/: Three.js r180 med relative modulimporter og original MIT-licens.
tests/: testforløb med tydeligt deklarerede simulerede API-svar.
credits.html og assets/ASSET-SOURCES.txt: kilder, bearbejdning og licenser.
Brikkernes MIT-licens og Three.js-licensen skal følge med ved deling.
Træteksturer er CC0. Biblioteksbilledet er AI-genereret; prompten følger med.
