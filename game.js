(() => {
  const COLS = 10, ROWS = 20, CELL = 24;
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const nextCanvas = document.getElementById('next');
  const nctx = nextCanvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const overlayText = document.getElementById('overlay-text');
  const startBtn = document.getElementById('startBtn');
  const scoreEl = document.getElementById('score');
  const linesEl = document.getElementById('lines');
  const levelEl = document.getElementById('level');

  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;

  // Rainbow color set, one per piece type (ROYGBIV-ish)
  const COLORS = {
    I: '#ff3b3b', // red
    O: '#ff9d1f', // orange
    T: '#ffe11f', // yellow
    S: '#3dd453', // green
    Z: '#1fb2ff', // blue
    J: '#5a5fff', // indigo
    L: '#c355ff'  // violet
  };

  const SHAPES = {
    I: [[0,1],[1,1],[2,1],[3,1]],
    O: [[1,0],[2,0],[1,1],[2,1]],
    T: [[1,0],[0,1],[1,1],[2,1]],
    S: [[1,0],[2,0],[0,1],[1,1]],
    Z: [[0,0],[1,0],[1,1],[2,1]],
    J: [[0,0],[0,1],[1,1],[2,1]],
    L: [[2,0],[0,1],[1,1],[2,1]]
  };
  const TYPES = Object.keys(SHAPES);

  let board, current, next, score, lines, level, dropInterval, dropTimer, lastTime;
  let running = false, paused = false, gameOverFlag = false;
  let rafId = null;

  function emptyBoard() {
    return Array.from({length: ROWS}, () => Array(COLS).fill(null));
  }

  function randomPiece() {
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    const cells = SHAPES[type].map(([x, y]) => ({x, y}));
    return { type, cells, x: 3, y: -1, rot: 0 };
  }

  function rotateCells(cells) {
    // rotate around approximate center (1.5,1.5) for 4x4 box, then round
    return cells.map(({x, y}) => ({ x: 3 - y, y: x }));
  }

  function collides(cells, ox, oy, b) {
    for (const {x, y} of cells) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && b[ny][nx]) return true;
    }
    return false;
  }

  function place() {
    for (const {x, y} of current.cells) {
      const bx = x + current.x, by = y + current.y;
      if (by >= 0) board[by][bx] = current.type;
    }
    clearLines();
    current = next;
    next = randomPiece();
    drawNext();
    if (collides(current.cells, current.x, current.y, board)) {
      endGame();
    }
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(c => c)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(null));
        cleared++;
        y++;
      }
    }
    if (cleared) {
      const points = [0, 100, 300, 500, 800][cleared] * level;
      score += points;
      lines += cleared;
      level = 1 + Math.floor(lines / 10);
      dropInterval = Math.max(100, 800 - (level - 1) * 70);
      updateHUD();
    }
  }

  function updateHUD() {
    scoreEl.textContent = score;
    linesEl.textContent = lines;
    levelEl.textContent = level;
  }

  function move(dx) {
    if (!running || paused) return;
    if (!collides(current.cells, current.x + dx, current.y, board)) current.x += dx;
    draw();
  }

  function softDrop() {
    if (!running || paused) return;
    if (!collides(current.cells, current.x, current.y + 1, board)) {
      current.y += 1;
      score += 1;
      updateHUD();
    } else {
      place();
    }
    draw();
  }

  function hardDrop() {
    if (!running || paused) return;
    let dist = 0;
    while (!collides(current.cells, current.x, current.y + 1, board)) {
      current.y += 1;
      dist++;
    }
    score += dist * 2;
    updateHUD();
    place();
    draw();
  }

  function rotate() {
    if (!running || paused) return;
    const rotated = rotateCells(current.cells);
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (!collides(rotated, current.x + k, current.y, board)) {
        current.cells = rotated;
        current.x += k;
        draw();
        return;
      }
    }
  }

  function drawCell(c, x, y, color) {
    c.fillStyle = color;
    c.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
    c.fillStyle = 'rgba(255,255,255,.25)';
    c.fillRect(x * CELL, y * CELL, CELL - 1, 4);
  }

  function draw() {
    ctx.fillStyle = '#101210';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (board[y][x]) drawCell(ctx, x, y, COLORS[board[y][x]]);
      }
    }
    if (current) {
      for (const {x, y} of current.cells) {
        const bx = x + current.x, by = y + current.y;
        if (by >= 0) drawCell(ctx, bx, by, COLORS[current.type]);
      }
    }
    // grid lines
    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(canvas.width, y * CELL); ctx.stroke();
    }
  }

  function drawNext() {
    nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nctx.fillStyle = '#101210';
    nctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    const s = 14;
    for (const {x, y} of next.cells) {
      nctx.fillStyle = COLORS[next.type];
      nctx.fillRect(x * s + 4, y * s + 4, s - 1, s - 1);
    }
  }

  function loop(ts) {
    if (!running || paused) return;
    if (!lastTime) lastTime = ts;
    const dt = ts - lastTime;
    if (dt > dropInterval) {
      lastTime = ts;
      if (!collides(current.cells, current.x, current.y + 1, board)) {
        current.y += 1;
      } else {
        place();
      }
      draw();
    }
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    board = emptyBoard();
    current = randomPiece();
    next = randomPiece();
    score = 0; lines = 0; level = 1;
    dropInterval = 800;
    lastTime = 0;
    running = true; paused = false; gameOverFlag = false;
    updateHUD();
    drawNext();
    draw();
    overlay.classList.add('hidden');
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function endGame() {
    running = false;
    gameOverFlag = true;
    if (rafId) cancelAnimationFrame(rafId);
    overlayText.textContent = `GAME OVER\nScore: ${score}\nLines: ${lines}`;
    startBtn.textContent = 'Retry';
    overlay.classList.remove('hidden');
  }

  function togglePause() {
    if (!running && !gameOverFlag) return;
    if (gameOverFlag) return;
    paused = !paused;
    if (paused) {
      overlayText.textContent = 'PAUSED';
      startBtn.textContent = 'Resume';
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
      lastTime = 0;
      rafId = requestAnimationFrame(loop);
    }
  }

  startBtn.addEventListener('click', () => {
    if (paused && !gameOverFlag) { togglePause(); return; }
    startGame();
  });

  document.getElementById('btnPause').addEventListener('click', togglePause);
  document.getElementById('btnSelect').addEventListener('click', () => { if (!running || gameOverFlag) startGame(); });
  document.getElementById('btnUp').addEventListener('click', rotate);
  document.getElementById('btnLeft').addEventListener('click', () => move(-1));
  document.getElementById('btnRight').addEventListener('click', () => move(1));
  document.getElementById('btnDown').addEventListener('click', softDrop);
  document.getElementById('btnRotate').addEventListener('click', rotate);
  document.getElementById('btnDrop').addEventListener('click', hardDrop);

  // prevent double-tap zoom / touch scroll issues on control buttons
  document.querySelectorAll('.ctrl-btn').forEach(btn => {
    btn.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
  });

  // block pinch-zoom, double-tap zoom, and overscroll gestures app-wide
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('gesturechange', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowLeft': move(-1); break;
      case 'ArrowRight': move(1); break;
      case 'ArrowDown': softDrop(); break;
      case 'ArrowUp': rotate(); break;
      case ' ': e.preventDefault(); hardDrop(); break;
      case 'p': case 'P': togglePause(); break;
      case 'Enter': if (!running) startGame(); break;
    }
  });

  // initial overlay
  overlayText.textContent = 'BLOCK STACKER\n\nArrows: move/rotate\nSpace: hard drop\nP: pause';
  board = emptyBoard();
  draw();

  // register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
