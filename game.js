/**
 * Game adapter for the existing chess.emilian.dk rules and Chess-API integration.
 * No DOM or renderer dependencies. r=0 is rank 8; c=0 is file a.
 * Every emitted state is a detached copy, safe for a renderer to retain.
 */
export function createGame({ onChange = () => {}, onPromotion } = {}) {
  const CHESS_API_URL = 'https://chess-api.com/v1';
  const files = ['a','b','c','d','e','f','g','h'];
  let board = initialBoard();
  let turn = 'w';
  let selected = null;
  let legalTargets = [];
  let enPassant = null;
  let moveLog = [];
  let snapshots = [];
  let lastMove = null;
  let gameOver = false;
  let pendingPromotion = null;
  let humanColor = 'w';
  let engineColor = 'b';
  let engineReady = false;
  let engineLoading = false;
  let engineFailed = false;
  let engineThinking = false;
  let engineEval = null;
  let engineDepth = null;
  let engineErrorMessage = '';
  let engineAbortController = null;
  let engineSearchId = 0;
  let engineTimer = null;
  let started = false;
  let targetDepth = 18;
  let engineHasResponded = false;

  function getState() {
    const check = inCheck(board,turn);
    return {
      board: cloneBoard(board), turn, humanColor, engineColor,
      selected: selected ? {...selected} : null,
      legalTargets: legalTargets.map(move => ({...move})),
      lastMove: lastMove ? {from:{...lastMove.from},to:{...lastMove.to}} : null,
      gameOver, moveLog: moveLog.map(move => ({...move})),
      pendingPromotion: pendingPromotion ? {
        from: {...pendingPromotion.from}, move: {...pendingPromotion.move},
        color: board[pendingPromotion.from.r][pendingPromotion.from.c].color
      } : null,
      engine: {
        ready: engineReady, loading: engineLoading, failed: engineFailed,
        thinking: engineThinking, error: engineErrorMessage,
        eval: engineEval ? {...engineEval} : null,
        depth: engineDepth, targetDepth, hasResponded: engineHasResponded
      },
      canUndo: snapshots.length > 0 && moveLog.some(move => move.color===humanColor),
      inCheck: check, checkSquare: check ? findKing(board,turn) : null,
      result: gameOver ? (check ? 'checkmate' : 'stalemate') : null,
      fen: boardToFEN()
    };
  }

  function render() { onChange(getState()); }

  function scheduleEngineMove(delay = 30) {
    clearTimeout(engineTimer);
    if (!started || gameOver || turn!==engineColor) return;
    engineTimer = setTimeout(() => {
      engineTimer = null;
      void maybeRequestEngineMove();
    }, delay);
  }

  function initialBoard() {
    const empty = Array.from({length:8}, () => Array(8).fill(null));
    const back = ['r','n','b','q','k','b','n','r'];
    for (let c=0; c<8; c++) {
      empty[0][c] = { type: back[c], color:'b', moved:false };
      empty[1][c] = { type:'p', color:'b', moved:false };
      empty[6][c] = { type:'p', color:'w', moved:false };
      empty[7][c] = { type: back[c], color:'w', moved:false };
    }
    return empty;
  }

  function cloneBoard(b) {
    return b.map(row => row.map(p => p ? {...p} : null));
  }

  function inBounds(r,c) { return r>=0 && r<8 && c>=0 && c<8; }
  function enemy(color) { return color === 'w' ? 'b' : 'w'; }
  function coord(r,c) { return files[c] + (8-r); }

  function squareFromUci(text) {
    if (!/^[a-h][1-8]$/.test(text)) return null;
    return { r: 8 - Number(text[1]), c: files.indexOf(text[0]) };
  }

  function castlingRights() {
    let rights='';
    const wk=board[7]?.[4];
    if (wk && wk.color==='w' && wk.type==='k' && !wk.moved) {
      const rh=board[7][7], ra=board[7][0];
      if (rh && rh.color==='w' && rh.type==='r' && !rh.moved) rights+='K';
      if (ra && ra.color==='w' && ra.type==='r' && !ra.moved) rights+='Q';
    }
    const bk=board[0]?.[4];
    if (bk && bk.color==='b' && bk.type==='k' && !bk.moved) {
      const rh=board[0][7], ra=board[0][0];
      if (rh && rh.color==='b' && rh.type==='r' && !rh.moved) rights+='k';
      if (ra && ra.color==='b' && ra.type==='r' && !ra.moved) rights+='q';
    }
    return rights || '-';
  }

  // FEN should only expose an en-passant target when the side to move can
  // actually make a legal en-passant capture. This matches chess.js' normal
  // FEN output and avoids strict API validators rejecting otherwise harmless
  // target squares after a two-square pawn push.
  function fenEnPassantSquare() {
    if (!enPassant || enPassant.captureColor!==turn) return '-';

    const fromRow=enPassant.pawnR;
    for (const dc of [-1,1]) {
      const fromCol=enPassant.pawnC+dc;
      if (!inBounds(fromRow,fromCol)) continue;
      const p=board[fromRow][fromCol];
      if (!p || p.color!==turn || p.type!=='p') continue;
      const canCapture=legalMovesFor(board,fromRow,fromCol,enPassant).some(move =>
        move.enPassant && move.r===enPassant.r && move.c===enPassant.c
      );
      if (canCapture) return coord(enPassant.r,enPassant.c);
    }
    return '-';
  }

  function boardToFEN() {
    const rows=[];
    for (let r=0;r<8;r++) {
      let row='', empty=0;
      for (let c=0;c<8;c++) {
        const p=board[r][c];
        if (!p) { empty++; continue; }
        if (empty) { row+=empty; empty=0; }
        let letter=p.type;
        if (p.color==='w') letter=letter.toUpperCase();
        row+=letter;
      }
      if (empty) row+=empty;
      rows.push(row);
    }
    const ep=fenEnPassantSquare();
    const fullmove=Math.floor(moveLog.length/2)+1;
    return `${rows.join('/')} ${turn} ${castlingRights()} ${ep} 0 ${fullmove}`;
  }

  function validateFenForApi(fen) {
    const tokens=String(fen).trim().split(/\s+/);
    if (tokens.length!==6) return {ok:false,error:'FEN skal have 6 felter'};

    const [position, side, castling, ep, halfmove, fullmove]=tokens;
    if (!/^[wb]$/.test(side)) return {ok:false,error:'ugyldig side til at trække'};
    if (!/^(-|K?Q?k?q?)$/.test(castling) || castling==='') return {ok:false,error:'ugyldige rokaderettigheder'};
    if (!/^(-|[a-h][36])$/.test(ep)) return {ok:false,error:'ugyldigt en-passant-felt'};
    if (ep!=='-' && ((ep[1]==='3' && side!=='b') || (ep[1]==='6' && side!=='w'))) {
      return {ok:false,error:'en-passant-felt passer ikke til siden i trækket'};
    }
    if (!/^\d+$/.test(halfmove)) return {ok:false,error:'ugyldigt halvt-trækstal'};
    if (!/^\d+$/.test(fullmove) || Number(fullmove)<1) return {ok:false,error:'ugyldigt træknummer'};

    const rows=position.split('/');
    if (rows.length!==8) return {ok:false,error:'brættet skal have 8 rækker'};
    let whiteKings=0, blackKings=0;
    for (let r=0;r<8;r++) {
      let count=0;
      for (const ch of rows[r]) {
        if (/^[1-8]$/.test(ch)) count+=Number(ch);
        else if (/^[prnbqkPRNBQK]$/.test(ch)) {
          count++;
          if (ch==='K') whiteKings++;
          if (ch==='k') blackKings++;
          if ((r===0 || r===7) && ch.toLowerCase()==='p') return {ok:false,error:'bonde på første eller ottende række'};
        } else return {ok:false,error:'ugyldigt brættegn'};
      }
      if (count!==8) return {ok:false,error:`række ${8-r} har ikke 8 felter`};
    }
    if (whiteKings!==1 || blackKings!==1) return {ok:false,error:'stillingen skal have præcis én konge af hver farve'};
    return {ok:true};
  }

  function cancelEngineSearch() {
    // Invalidate both pending timers and responses, including fetch mocks or
    // transports which finish despite receiving the AbortSignal.
    engineSearchId++;
    clearTimeout(engineTimer);
    engineTimer=null;
    engineThinking=false;
    if (engineAbortController) engineAbortController.abort();
    engineAbortController=null;
  }

  function failEngine(message) {
    engineLoading=false; engineReady=false; engineFailed=true; engineThinking=false;
    engineAbortController=null;
    engineErrorMessage=message || 'Chess-API.com er ikke tilgængelig lige nu.';
    render();
  }

  async function startEngine() {
    if (engineLoading || engineReady) return;
    engineLoading=true; engineFailed=false; engineErrorMessage='';
    render();
    // As in the original, no separate paid/work-consuming health request.
    // ready means prepared to request; hasResponded records a verified reply.
    await Promise.resolve();
    if (typeof navigator!=='undefined' && navigator.onLine===false) {
      failEngine('Ingen internetforbindelse. Chess-API.com kræver internet.');
      return;
    }
    engineLoading=false; engineReady=true; engineFailed=false; engineErrorMessage='';
    render();
    void maybeRequestEngineMove();
  }

  function applyEngineMove(uci) {
    if (gameOver || turn!==engineColor) return;
    const clean=String(uci || '').trim().toLowerCase();
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(clean)) {
      failEngine(`Ugyldigt træk fra motoren: ${uci || 'tomt svar'}`);
      return;
    }
    const from=squareFromUci(clean.slice(0,2));
    const to=squareFromUci(clean.slice(2,4));
    const piece=board[from.r][from.c];
    if (!piece || piece.color!==engineColor) {
      failEngine(`Motortrækket passer ikke til stillingen: ${uci}`);
      return;
    }
    const isPromotion=piece.type==='p' && (to.r===0 || to.r===7);
    const promotion=clean[4] || (isPromotion ? 'q' : null);
    if (promotion && !isPromotion) {
      failEngine(`Ugyldig bondeforvandling fra motoren: ${uci}`);
      return;
    }
    const move=legalMovesFor(board,from.r,from.c).find(m=>m.r===to.r && m.c===to.c);
    if (!move) { failEngine(`Motoren foreslog et ulovligt træk: ${uci}`); return; }
    executeMove(from,move,promotion);
  }

  async function maybeRequestEngineMove() {
    if (!started || gameOver || turn!==engineColor || engineThinking) return;
    if (!engineReady) { render(); return; }

    const searchId=++engineSearchId;
    const controller=new AbortController();
    engineAbortController=controller;
    engineThinking=true;
    engineEval=null; engineDepth=null;
    const fen=boardToFEN();
    const fenCheck=validateFenForApi(fen);
    if (!fenCheck.ok) {
      failEngine(`Intern FEN-fejl: ${fenCheck.error}.`);
      return;
    }
    const depth=targetDepth;
    render();

    try {
      const response=await fetch(CHESS_API_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          fen, variants:1, depth, maxThinkingTime:100,
          taskId:`3dskak-${Date.now()}-${searchId}`
        }),
        signal:controller.signal
      });
      if (!response.ok) {
        let detail='';
        try {
          const errorData=await response.json();
          detail=errorData?.error || errorData?.text || errorData?.message || '';
        } catch (_) {}
        throw new Error(detail || `Chess-API.com svarede med HTTP ${response.status}.`);
      }
      const data=await response.json();
      if (searchId!==engineSearchId) return;
      if (!data || typeof data!=='object') throw new Error('Chess-API.com returnerede et ugyldigt svar.');
      if (data.error || data.type==='error') {
        throw new Error(data.error || data.text || 'Chess-API.com returnerede en fejl.');
      }
      const bestmove=data.move || data.lan;
      if (!bestmove) throw new Error('Chess-API.com returnerede ikke et motortræk.');

      engineThinking=false;
      engineAbortController=null;
      engineHasResponded=true;
      if (data.mate != null && Number.isFinite(Number(data.mate))) {
        engineEval={type:'mate', value:Number(data.mate)};
      } else if (data.eval != null && Number.isFinite(Number(data.eval))) {
        // Chess-API eval is from White's perspective: positive = White.
        engineEval={type:'pawns', value:Number(data.eval)};
      } else if (data.centipawns != null && Number.isFinite(Number(data.centipawns))) {
        engineEval={type:'pawns', value:Number(data.centipawns)/100};
      }
      if (data.depth != null && Number.isFinite(Number(data.depth))) engineDepth=Number(data.depth);
      applyEngineMove(bestmove);
    } catch (error) {
      if (searchId!==engineSearchId) return;
      engineThinking=false;
      engineAbortController=null;
      const message=error?.message || String(error);
      if (/INVALID_FEN_VALIDATION_ERROR|invalid\s+fen/i.test(message)) {
        failEngine('Chess-API afviste skakstillingen. Prøv igen eller start et nyt spil.');
      } else {
        failEngine(message);
      }
    }
  }

  function isSquareAttacked(b, r, c, byColor) {
    const pawnDir = byColor === 'w' ? -1 : 1;
    const pawnRow = r - pawnDir;
    for (const dc of [-1,1]) {
      const pc = c - dc;
      if (inBounds(pawnRow, pc)) {
        const p = b[pawnRow][pc];
        if (p && p.color === byColor && p.type === 'p') return true;
      }
    }

    const knightMoves = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr,dc] of knightMoves) {
      const rr=r+dr, cc=c+dc;
      if (inBounds(rr,cc)) {
        const p=b[rr][cc];
        if (p && p.color===byColor && p.type==='n') return true;
      }
    }

    for (let dr=-1; dr<=1; dr++) for (let dc=-1; dc<=1; dc++) {
      if (!dr && !dc) continue;
      const rr=r+dr, cc=c+dc;
      if (inBounds(rr,cc)) {
        const p=b[rr][cc];
        if (p && p.color===byColor && p.type==='k') return true;
      }
    }

    const orth = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dr,dc] of orth) {
      let rr=r+dr, cc=c+dc;
      while (inBounds(rr,cc)) {
        const p=b[rr][cc];
        if (p) {
          if (p.color===byColor && (p.type==='r' || p.type==='q')) return true;
          break;
        }
        rr+=dr; cc+=dc;
      }
    }

    const diag = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [dr,dc] of diag) {
      let rr=r+dr, cc=c+dc;
      while (inBounds(rr,cc)) {
        const p=b[rr][cc];
        if (p) {
          if (p.color===byColor && (p.type==='b' || p.type==='q')) return true;
          break;
        }
        rr+=dr; cc+=dc;
      }
    }
    return false;
  }

  function findKing(b, color) {
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
      const p=b[r][c];
      if (p && p.color===color && p.type==='k') return {r,c};
    }
    return null;
  }

  function inCheck(b, color) {
    const k=findKing(b,color);
    return k ? isSquareAttacked(b,k.r,k.c,enemy(color)) : true;
  }

  function addSlidingMoves(b, r, c, color, dirs, out) {
    for (const [dr,dc] of dirs) {
      let rr=r+dr, cc=c+dc;
      while (inBounds(rr,cc)) {
        const target=b[rr][cc];
        if (!target) out.push({r:rr,c:cc});
        else {
          if (target.color!==color) out.push({r:rr,c:cc,capture:true});
          break;
        }
        rr+=dr; cc+=dc;
      }
    }
  }

  function pseudoMoves(b, r, c, epState, includeCastling=true) {
    const p=b[r][c];
    if (!p) return [];
    const out=[];
    const {color,type}=p;

    if (type==='p') {
      const dir=color==='w' ? -1 : 1;
      const start=color==='w' ? 6 : 1;
      const one=r+dir;
      if (inBounds(one,c) && !b[one][c]) {
        out.push({r:one,c});
        const two=r+2*dir;
        if (r===start && !p.moved && inBounds(two,c) && !b[two][c]) out.push({r:two,c,doublePawn:true});
      }
      for (const dc of [-1,1]) {
        const rr=r+dir, cc=c+dc;
        if (!inBounds(rr,cc)) continue;
        const target=b[rr][cc];
        if (target && target.color!==color) out.push({r:rr,c:cc,capture:true});
        if (epState && epState.r===rr && epState.c===cc && epState.captureColor===color) {
          out.push({r:rr,c:cc,capture:true,enPassant:true,epPawnR:epState.pawnR,epPawnC:epState.pawnC});
        }
      }
    }

    if (type==='n') {
      const d=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
      for (const [dr,dc] of d) {
        const rr=r+dr, cc=c+dc;
        if (!inBounds(rr,cc)) continue;
        const t=b[rr][cc];
        if (!t || t.color!==color) out.push({r:rr,c:cc,capture:!!t});
      }
    }

    if (type==='b') addSlidingMoves(b,r,c,color,[[1,1],[1,-1],[-1,1],[-1,-1]],out);
    if (type==='r') addSlidingMoves(b,r,c,color,[[1,0],[-1,0],[0,1],[0,-1]],out);
    if (type==='q') addSlidingMoves(b,r,c,color,[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]],out);

    if (type==='k') {
      for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
        if (!dr && !dc) continue;
        const rr=r+dr, cc=c+dc;
        if (!inBounds(rr,cc)) continue;
        const t=b[rr][cc];
        if (!t || t.color!==color) out.push({r:rr,c:cc,capture:!!t});
      }

      if (includeCastling && !p.moved && !inCheck(b,color)) {
        const homeRow=color==='w' ? 7 : 0;
        if (r===homeRow && c===4) {
          const rookK=b[homeRow][7];
          if (rookK && rookK.color===color && rookK.type==='r' && !rookK.moved && !b[homeRow][5] && !b[homeRow][6] &&
              !isSquareAttacked(b,homeRow,5,enemy(color)) && !isSquareAttacked(b,homeRow,6,enemy(color))) {
            out.push({r:homeRow,c:6,castle:'k'});
          }
          const rookQ=b[homeRow][0];
          if (rookQ && rookQ.color===color && rookQ.type==='r' && !rookQ.moved && !b[homeRow][1] && !b[homeRow][2] && !b[homeRow][3] &&
              !isSquareAttacked(b,homeRow,3,enemy(color)) && !isSquareAttacked(b,homeRow,2,enemy(color))) {
            out.push({r:homeRow,c:2,castle:'q'});
          }
        }
      }
    }
    return out;
  }

  function applyMoveToBoard(b, from, move, promotionType=null) {
    const moving=b[from.r][from.c];
    const next=cloneBoard(b);
    const piece={...moving, moved:true};
    next[from.r][from.c]=null;

    if (move.enPassant) next[move.epPawnR][move.epPawnC]=null;

    if (move.castle==='k') {
      const rook=next[from.r][7];
      next[from.r][7]=null;
      next[from.r][5]={...rook,moved:true};
    } else if (move.castle==='q') {
      const rook=next[from.r][0];
      next[from.r][0]=null;
      next[from.r][3]={...rook,moved:true};
    }

    if (piece.type==='p' && (move.r===0 || move.r===7)) piece.type=promotionType || 'q';
    next[move.r][move.c]=piece;
    return next;
  }

  function legalMovesFor(b, r, c, epState=enPassant) {
    const p=b[r][c];
    if (!p) return [];
    return pseudoMoves(b,r,c,epState,true).filter(move => {
      const test=applyMoveToBoard(b,{r,c},move,'q');
      return !inCheck(test,p.color);
    });
  }

  function anyLegalMove(color) {
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
      const p=board[r][c];
      if (p && p.color===color && legalMovesFor(board,r,c).length) return true;
    }
    return false;
  }

  function snapshot() {
    return {
      board: cloneBoard(board), turn, enPassant: enPassant ? {...enPassant} : null,
      moveLog: moveLog.map(x=>({...x})), lastMove: lastMove ? JSON.parse(JSON.stringify(lastMove)) : null,
      gameOver
    };
  }

  function restore(s) {
    board=cloneBoard(s.board);
    turn=s.turn;
    enPassant=s.enPassant ? {...s.enPassant}:null;
    moveLog=s.moveLog.map(x=>({...x}));
    lastMove=s.lastMove ? JSON.parse(JSON.stringify(s.lastMove)):null;
    gameOver=s.gameOver;
    selected=null; legalTargets=[]; pendingPromotion=null;
    render();
  }

  function notationFor(from, move, pieceBefore, captured, promotionType, givesCheck, mate) {
    if (move.castle==='k') return 'O-O' + (mate ? '#' : givesCheck ? '+' : '');
    if (move.castle==='q') return 'O-O-O' + (mate ? '#' : givesCheck ? '+' : '');
    const letters={k:'K',q:'Q',r:'R',b:'B',n:'N',p:''};
    const capture=!!captured || move.enPassant;
    let text='';
    if (pieceBefore.type==='p' && capture) text += files[from.c];
    else text += letters[pieceBefore.type];
    text += capture ? 'x' : '';
    text += coord(move.r,move.c);
    if (promotionType) text += '=' + letters[promotionType];
    if (mate) text += '#'; else if (givesCheck) text += '+';
    return text;
  }

  function executeMove(from, move, promotionType=null) {
    if (gameOver) return;
    snapshots.push(snapshot());

    const pieceBefore={...board[from.r][from.c]};
    const captured = move.enPassant ? board[move.epPawnR][move.epPawnC] : board[move.r][move.c];

    board=applyMoveToBoard(board,from,move,promotionType);

    if (pieceBefore.type==='p' && Math.abs(move.r-from.r)===2) {
      enPassant={
        r:(move.r+from.r)/2, c:from.c,
        pawnR:move.r, pawnC:move.c,
        captureColor: enemy(pieceBefore.color)
      };
    } else enPassant=null;

    const previousTurn=turn;
    turn=enemy(turn);
    selected=null; legalTargets=[];
    lastMove={from:{...from},to:{r:move.r,c:move.c}};

    const check=inCheck(board,turn);
    const hasMove=anyLegalMove(turn);
    const mate=check && !hasMove;
    const stalemate=!check && !hasMove;

    moveLog.push({
      color: previousTurn,
      text: notationFor(from,move,pieceBefore,captured,promotionType,check,mate)
    });

    if (mate || stalemate) gameOver=true;
    render();
    scheduleEngineMove();
  }

  function openPromotion(from, move) {
    pendingPromotion={from:{...from},move:{...move}};
    render();
    if (onPromotion) onPromotion(getState().pendingPromotion);
  }

  function promote(type) {
    if (!pendingPromotion || !['q','r','b','n'].includes(type)) return false;
    const p=pendingPromotion;
    pendingPromotion=null;
    executeMove(p.from,p.move,type);
    return true;
  }

  function cancelPromotion() {
    if (!pendingPromotion) return;
    pendingPromotion=null; selected=null; legalTargets=[];
    render();
  }

  function clearSelection() {
    selected=null; legalTargets=[];
    render();
  }

  function selectSquare(r,c) {
    if (!Number.isInteger(r) || !Number.isInteger(c) || !inBounds(r,c)) return;
    if (gameOver || pendingPromotion || engineThinking || turn!==humanColor) return;
    const p=board[r][c];
    if (selected) {
      const move=legalTargets.find(m=>m.r===r && m.c===c);
      if (move) {
        const moving=board[selected.r][selected.c];
        if (moving.type==='p' && (r===0 || r===7)) openPromotion({...selected},move);
        else executeMove({...selected},move,null);
        return;
      }
    }
    if (p && p.color===turn) {
      selected={r,c};
      legalTargets=legalMovesFor(board,r,c);
    } else {
      selected=null; legalTargets=[];
    }
    render();
  }

  function normalizeDepth(value) {
    const n=Number(value);
    return Number.isFinite(n) ? Math.max(1,Math.min(18,Math.round(n))) : 18;
  }

  function newGame(options = {}) {
    cancelEngineSearch();
    if (options.humanColor==='w' || options.humanColor==='b') humanColor=options.humanColor;
    if (options.depth!==undefined) targetDepth=normalizeDepth(options.depth);
    engineColor=enemy(humanColor);
    board=initialBoard(); turn='w'; selected=null; legalTargets=[]; enPassant=null;
    moveLog=[]; snapshots=[]; lastMove=null; gameOver=false; pendingPromotion=null;
    engineEval=null; engineDepth=null;
    render();
    if (started && engineFailed && !engineLoading) void startEngine();
    scheduleEngineMove(50);
  }

  function undo() {
    if (!snapshots.length || !moveLog.some(move=>move.color===humanColor)) return;
    cancelEngineSearch();
    engineEval=null; engineDepth=null;
    let target=null;
    while (snapshots.length) {
      target=snapshots.pop();
      if (target.turn===humanColor) break;
    }
    if (target) restore(target);
  }

  function setDepth(value) {
    targetDepth=normalizeDepth(value);
    cancelEngineSearch();
    engineEval=null; engineDepth=null;
    render();
    scheduleEngineMove(50);
  }

  async function retryEngine() {
    started=true;
    cancelEngineSearch();
    engineReady=false; engineLoading=false;
    return startEngine();
  }

  async function start() {
    if (started) return;
    started=true;
    render();
    return startEngine();
  }

  return {getState,selectSquare,clearSelection,promote,cancelPromotion,newGame,undo,setDepth,retryEngine,start};
}
