3D SKAK - DELBAR BROWSERVERSION (FEN-FIX)
=========================================

Denne version kræver ingen Homebrew, Terminal eller lokal Stockfish-installation.
Stockfish 18 køres via Chess-API.com over internettet.

RETTELSE I DENNE VERSION
------------------------
FEN-generatoren sender nu kun et en-passant-felt, når en passant faktisk er et
lovligt træk for siden i trækket. Det matcher normal FEN-output fra chess.js og
undgår Chess-API-fejlen INVALID_FEN_VALIDATION_ERROR efter visse dobbelt-bondetræk.
Derudover valideres den genererede FEN lokalt, før den sendes til API'et.

START LOKALT
------------
1. Åbn index.html i en moderne browser.
2. Hvis browseren blokerer eksterne API-kald fra en lokal file://-side, host filen
   som en statisk hjemmeside i stedet (anbefalet).

DEL PÅ NETTET
-------------
Upload hele mappen eller blot index.html til en statisk webhost som Netlify,
GitHub Pages, Cloudflare Pages eller lignende. Der kræves ingen backend.

MOTOR
-----
Endpoint: https://chess-api.com/v1
Motor: Stockfish 18
Offentlig maksimal analysedypde i denne udgave: 18
maxThinkingTime: 100 ms

VIGTIGT
-------
- Internetforbindelse er nødvendig, når computeren skal trække.
- Den aktuelle FEN-stilling sendes til Chess-API.com til analyse.
- Tilgængelighed, hastighed og eventuelle brugsgrænser bestemmes af Chess-API.com.
- Stockfish er GPLv3-licenseret. Motoren er ikke bundlet i denne pakke.

FILER
-----
index.html  - hele spillet (HTML, CSS og JavaScript i én fil)
README.txt  - denne vejledning
