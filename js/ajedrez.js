"use strict";

const boardElement = document.querySelector("#board");
const turnElement = document.querySelector("#turn");
const statusElement = document.querySelector("#status");
const restartButton = document.querySelector("#restart");
const capturedElements = {
  white: document.querySelector("#white-captured"),
  black: document.querySelector("#black-captured"),
};
const captureCountElements = {
  white: document.querySelector("#white-capture-count"),
  black: document.querySelector("#black-capture-count"),
};
const moveHistoryElement = document.querySelector("#move-history");
const downloadTextButton = document.querySelector("#download-text");
const downloadPdfButton = document.querySelector("#download-pdf");
const promotionDialog = document.querySelector("#promotion-dialog");
const promotionOptions = document.querySelector("#promotion-options");

const files = "abcdefgh";
const pieceSymbols = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" },
};
const pieceNames = {
  king: "rey",
  queen: "dama",
  rook: "torre",
  bishop: "alfil",
  knight: "caballo",
  pawn: "peón",
};
const promotionTypes = ["queen", "rook", "bishop", "knight"];
const knightSteps = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const kingSteps = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const diagonalSteps = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const straightSteps = [[-1, 0], [0, -1], [0, 1], [1, 0]];

let game;
let selectedSquare = null;
let selectedMoves = [];
let pendingPromotion = null;

function createInitialBoard() {
  const backRank = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (let col = 0; col < 8; col += 1) {
    board[0][col] = { type: backRank[col], color: "black" };
    board[1][col] = { type: "pawn", color: "black" };
    board[6][col] = { type: "pawn", color: "white" };
    board[7][col] = { type: backRank[col], color: "white" };
  }
  return board;
}

function newGame() {
  return {
    board: createInitialBoard(),
    turn: "white",
    castling: { whiteKing: true, whiteQueen: true, blackKing: true, blackQueen: true },
    enPassant: null,
    lastMove: null,
    captured: { white: [], black: [] },
    history: [],
    finished: false,
  };
}

function isInside(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function otherColor(color) {
  return color === "white" ? "black" : "white";
}

function squareName(row, col) {
  return `${files[col]}${8 - row}`;
}

function cloneGame(position) {
  return {
    board: position.board.map((row) => row.map((piece) => piece && { ...piece })),
    turn: position.turn,
    castling: { ...position.castling },
    enPassant: position.enPassant && { ...position.enPassant },
    lastMove: position.lastMove && {
      from: { ...position.lastMove.from },
      to: { ...position.lastMove.to },
    },
    finished: position.finished,
  };
}

function findKing(position, color) {
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = position.board[row][col];
      if (piece && piece.color === color && piece.type === "king") {
        return { row, col };
      }
    }
  }
  throw new Error(`No se encontró el rey ${color === "white" ? "blanco" : "negro"}.`);
}

function isSquareAttacked(position, row, col, byColor) {
  const pawnRow = row + (byColor === "white" ? 1 : -1);
  for (const pawnCol of [col - 1, col + 1]) {
    if (!isInside(pawnRow, pawnCol)) continue;
    const piece = position.board[pawnRow][pawnCol];
    if (piece && piece.color === byColor && piece.type === "pawn") return true;
  }

  for (const [rowStep, colStep] of knightSteps) {
    const nextRow = row + rowStep;
    const nextCol = col + colStep;
    if (!isInside(nextRow, nextCol)) continue;
    const piece = position.board[nextRow][nextCol];
    if (piece && piece.color === byColor && piece.type === "knight") return true;
  }

  for (const [rowStep, colStep] of kingSteps) {
    const nextRow = row + rowStep;
    const nextCol = col + colStep;
    if (!isInside(nextRow, nextCol)) continue;
    const piece = position.board[nextRow][nextCol];
    if (piece && piece.color === byColor && piece.type === "king") return true;
  }

  const rays = [
    { directions: diagonalSteps, types: ["bishop", "queen"] },
    { directions: straightSteps, types: ["rook", "queen"] },
  ];
  for (const ray of rays) {
    for (const [rowStep, colStep] of ray.directions) {
      let nextRow = row + rowStep;
      let nextCol = col + colStep;
      while (isInside(nextRow, nextCol)) {
        const piece = position.board[nextRow][nextCol];
        if (piece) {
          if (piece.color === byColor && ray.types.includes(piece.type)) return true;
          break;
        }
        nextRow += rowStep;
        nextCol += colStep;
      }
    }
  }
  return false;
}

function isInCheck(position, color) {
  const king = findKing(position, color);
  return isSquareAttacked(position, king.row, king.col, otherColor(color));
}

function addSlidingMoves(position, row, col, piece, directions, moves) {
  for (const [rowStep, colStep] of directions) {
    let nextRow = row + rowStep;
    let nextCol = col + colStep;
    while (isInside(nextRow, nextCol)) {
      const target = position.board[nextRow][nextCol];
      if (!target) {
        moves.push({ from: { row, col }, to: { row: nextRow, col: nextCol } });
      } else {
        if (target.color !== piece.color) {
          moves.push({ from: { row, col }, to: { row: nextRow, col: nextCol } });
        }
        break;
      }
      nextRow += rowStep;
      nextCol += colStep;
    }
  }
}

function getPseudoMoves(position, row, col) {
  const piece = position.board[row][col];
  if (!piece) return [];
  const moves = [];

  if (piece.type === "pawn") {
    const direction = piece.color === "white" ? -1 : 1;
    const startRow = piece.color === "white" ? 6 : 1;
    const nextRow = row + direction;
    if (isInside(nextRow, col) && !position.board[nextRow][col]) {
      moves.push({ from: { row, col }, to: { row: nextRow, col } });
      const doubleRow = row + direction * 2;
      if (row === startRow && !position.board[doubleRow][col]) {
        moves.push({ from: { row, col }, to: { row: doubleRow, col } });
      }
    }

    for (const nextCol of [col - 1, col + 1]) {
      if (!isInside(nextRow, nextCol)) continue;
      const target = position.board[nextRow][nextCol];
      if (target && target.color !== piece.color) {
        moves.push({ from: { row, col }, to: { row: nextRow, col: nextCol } });
      } else if (
        position.enPassant &&
        position.enPassant.row === nextRow &&
        position.enPassant.col === nextCol
      ) {
        moves.push({ from: { row, col }, to: { row: nextRow, col: nextCol }, enPassant: true });
      }
    }
    return moves;
  }

  if (piece.type === "knight") {
    for (const [rowStep, colStep] of knightSteps) {
      const nextRow = row + rowStep;
      const nextCol = col + colStep;
      if (!isInside(nextRow, nextCol)) continue;
      const target = position.board[nextRow][nextCol];
      if (!target || target.color !== piece.color) {
        moves.push({ from: { row, col }, to: { row: nextRow, col: nextCol } });
      }
    }
    return moves;
  }

  if (piece.type === "bishop" || piece.type === "queen") {
    addSlidingMoves(position, row, col, piece, diagonalSteps, moves);
  }
  if (piece.type === "rook" || piece.type === "queen") {
    addSlidingMoves(position, row, col, piece, straightSteps, moves);
  }

  if (piece.type === "king") {
    for (const [rowStep, colStep] of kingSteps) {
      const nextRow = row + rowStep;
      const nextCol = col + colStep;
      if (!isInside(nextRow, nextCol)) continue;
      const target = position.board[nextRow][nextCol];
      if (!target || target.color !== piece.color) {
        moves.push({ from: { row, col }, to: { row: nextRow, col: nextCol } });
      }
    }
    addCastlingMoves(position, row, col, piece, moves);
  }
  return moves;
}

function addCastlingMoves(position, row, col, king, moves) {
  const homeRow = king.color === "white" ? 7 : 0;
  if (row !== homeRow || col !== 4 || isInCheck(position, king.color)) return;
  const enemyColor = otherColor(king.color);
  const sides = [
    { key: "King", rookCol: 7, transitCol: 5, destinationCol: 6, emptyCols: [5, 6], attackedCols: [5, 6] },
    { key: "Queen", rookCol: 0, transitCol: 3, destinationCol: 2, emptyCols: [1, 2, 3], attackedCols: [3, 2] },
  ];

  for (const side of sides) {
    const right = `${king.color}${side.key}`;
    const rook = position.board[homeRow][side.rookCol];
    if (!position.castling[right] || !rook || rook.color !== king.color || rook.type !== "rook") continue;
    if (side.emptyCols.some((emptyCol) => position.board[homeRow][emptyCol])) continue;
    if (side.attackedCols.some((testCol) => isSquareAttacked(position, homeRow, testCol, enemyColor))) continue;
    moves.push({
      from: { row, col },
      to: { row: homeRow, col: side.destinationCol },
      castle: side.rookCol === 7 ? "king" : "queen",
      transit: { row: homeRow, col: side.transitCol },
    });
  }
}

function disableRookRight(position, row, col, piece) {
  if (!piece || piece.type !== "rook") return;
  if (row === 7 && col === 0 && piece.color === "white") position.castling.whiteQueen = false;
  if (row === 7 && col === 7 && piece.color === "white") position.castling.whiteKing = false;
  if (row === 0 && col === 0 && piece.color === "black") position.castling.blackQueen = false;
  if (row === 0 && col === 7 && piece.color === "black") position.castling.blackKing = false;
}

function applyMove(position, move, promotion = "queen") {
  const { from, to } = move;
  const piece = position.board[from.row][from.col];
  const captured = position.board[to.row][to.col];

  disableRookRight(position, from.row, from.col, piece);
  disableRookRight(position, to.row, to.col, captured);
  if (piece.type === "king") {
    position.castling[`${piece.color}King`] = false;
    position.castling[`${piece.color}Queen`] = false;
  }

  position.board[from.row][from.col] = null;
  if (move.enPassant) position.board[from.row][to.col] = null;
  position.board[to.row][to.col] = {
    ...piece,
    type: piece.type === "pawn" && (to.row === 0 || to.row === 7) ? promotion : piece.type,
  };

  if (move.castle) {
    const rookFromCol = move.castle === "king" ? 7 : 0;
    const rookToCol = move.castle === "king" ? to.col - 1 : to.col + 1;
    position.board[to.row][rookToCol] = position.board[to.row][rookFromCol];
    position.board[to.row][rookFromCol] = null;
  }

  position.enPassant = null;
  if (piece.type === "pawn" && Math.abs(to.row - from.row) === 2) {
    position.enPassant = { row: (from.row + to.row) / 2, col: from.col };
  }
  position.lastMove = { from: { ...from }, to: { ...to } };
  position.turn = otherColor(piece.color);
  return piece;
}

function getLegalMoves(position, row, col) {
  const piece = position.board[row][col];
  if (!piece) return [];
  return getPseudoMoves(position, row, col).filter((move) => {
    const simulated = cloneGame(position);
    applyMove(simulated, move);
    return !isInCheck(simulated, piece.color);
  });
}

function getAllLegalMoves(position, color) {
  const moves = [];
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = position.board[row][col];
      if (piece && piece.color === color) moves.push(...getLegalMoves(position, row, col));
    }
  }
  return moves;
}

function updateGameStatus() {
  const checked = isInCheck(game, game.turn);
  const legalMoves = getAllLegalMoves(game, game.turn);
  if (legalMoves.length === 0) {
    game.finished = true;
    if (checked) {
      const winner = game.turn === "white" ? "negras" : "blancas";
      turnElement.textContent = "Partida finalizada";
      statusElement.textContent = `Jaque mate. ¡Ganan las ${winner}!`;
    } else {
      turnElement.textContent = "Partida finalizada";
      statusElement.textContent = "Tablas por ahogado.";
    }
    return;
  }

  game.finished = false;
  turnElement.textContent = game.turn === "white" ? "Juegan blancas" : "Juegan negras";
  statusElement.textContent = checked ? "¡Jaque!" : "";
}

function renderBoard() {
  const squares = [];
  const legalTargets = new Map(
    selectedMoves.map((move) => [`${move.to.row},${move.to.col}`, move]),
  );

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const square = document.createElement("button");
      const coordinate = squareName(row, col);
      const piece = game.board[row][col];
      const isLight = (row + col) % 2 === 1;
      square.type = "button";
      square.className = `square ${isLight ? "light" : "dark"}`;
      square.setAttribute("role", "gridcell");
      square.dataset.row = String(row);
      square.dataset.col = String(col);
      square.setAttribute(
        "aria-label",
        piece ? `${coordinate}, ${piece.color === "white" ? "blancas" : "negras"}: ${pieceNames[piece.type]}` : coordinate,
      );

      if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
        square.classList.add("selected");
      }
      if (
        game.lastMove &&
        ((game.lastMove.from.row === row && game.lastMove.from.col === col) ||
          (game.lastMove.to.row === row && game.lastMove.to.col === col))
      ) {
        square.classList.add("last-move");
      }
      const targetMove = legalTargets.get(`${row},${col}`);
      if (targetMove) {
        square.classList.add(game.board[row][col] || targetMove.enPassant ? "legal-capture" : "legal-move");
      }

      if (piece) {
        const symbol = document.createElement("span");
        symbol.className = `piece ${piece.color}`;
        symbol.setAttribute("aria-hidden", "true");
        symbol.textContent = pieceSymbols[piece.color][piece.type];
        square.append(symbol);
      }
      if (row === 7 || col === 0) {
        const label = document.createElement("span");
        label.className = "coordinates";
        label.setAttribute("aria-hidden", "true");
        label.textContent = row === 7 ? files[col] : String(8 - row);
        square.append(label);
      }
      squares.push(square);
    }
  }

  boardElement.replaceChildren(...squares);
}

function renderCapturedPieces() {
  for (const color of ["white", "black"]) {
    const pieces = game.captured[color];
    captureCountElements[color].textContent = String(pieces.length);
    capturedElements[color].replaceChildren();

    for (const piece of pieces) {
      const symbol = document.createElement("span");
      symbol.className = `captured-piece ${piece.color}`;
      symbol.textContent = pieceSymbols[piece.color][piece.type];
      symbol.setAttribute("aria-label", `${pieceNames[piece.type]} capturado`);
      capturedElements[color].append(symbol);
    }
    if (pieces.length === 0) {
      const emptyMessage = document.createElement("span");
      emptyMessage.className = "capture-empty";
      emptyMessage.textContent = "Aún no hay capturas";
      capturedElements[color].append(emptyMessage);
    }
  }
}

function renderMoveHistory() {
  const hasMoves = game.history.length > 0;
  downloadTextButton.disabled = !hasMoves;
  downloadPdfButton.disabled = !hasMoves;

  if (game.history.length === 0) {
    const emptyMessage = document.createElement("li");
    emptyMessage.className = "history-empty";
    emptyMessage.textContent = "Las jugadas aparecerán aquí.";
    moveHistoryElement.replaceChildren(emptyMessage);
    return;
  }

  const entries = game.history.map((move, index) => {
    const item = document.createElement("li");
    item.className = `history-entry ${move.color}`;

    const number = document.createElement("span");
    number.className = "history-number";
    number.textContent = `${Math.floor(index / 2) + 1}.`;

    const player = document.createElement("span");
    player.className = "history-player";
    player.textContent = move.color === "white" ? "Blancas" : "Negras";

    const details = document.createElement("span");
    details.className = "history-details";
    details.textContent = formatMove(move);

    item.append(number, player, details);
    return item;
  });
  moveHistoryElement.replaceChildren(...entries);
  moveHistoryElement.scrollTop = moveHistoryElement.scrollHeight;
}

function formatMove(move) {
  let description;
  if (move.castle) {
    description = `Enroque ${move.castle === "king" ? "corto" : "largo"} (${squareName(move.from.row, move.from.col)} → ${squareName(move.to.row, move.to.col)})`;
  } else {
    const destination = squareName(move.to.row, move.to.col);
    const movement = move.capturedPiece
      ? ` × ${destination} (captura ${pieceNames[move.capturedPiece.type]})`
      : ` → ${destination}`;
    const promotion = move.promotion ? ` = ${pieceNames[move.promotion]}` : "";
    description = `${pieceNames[move.piece]} ${squareName(move.from.row, move.from.col)}${movement}${promotion}`;
  }
  if (move.checkmate) description += " · jaque mate";
  else if (move.check) description += " · jaque";
  return description;
}

function getGameRecord() {
  const result = game.finished
    ? `Finalizada: ${statusElement.textContent}`
    : statusElement.textContent
      ? `En curso: ${statusElement.textContent}`
      : "En curso";
  const lines = [
    "AJEDREZ - HISTORIAL DE PARTIDA",
    `Fecha: ${new Date().toLocaleString("es-ES")}`,
    `Estado: ${result}`,
    `Jugadas registradas: ${game.history.length}`,
    "",
  ];

  game.history.forEach((move, index) => {
    const number = Math.floor(index / 2) + 1;
    const player = move.color === "white" ? "Blancas" : "Negras";
    lines.push(`${number}. ${player}: ${formatMove(move)}`);
  });
  return lines;
}

function downloadFile(contents, mimeType, extension) {
  const file = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  link.href = url;
  link.download = `partida-ajedrez-${timestamp}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toAscii(text) {
  return text
    .replace(/→/g, "->")
    .replace(/×/g, "x")
    .replace(/·/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function wrapPdfLines(lines, maxLength) {
  const wrapped = [];
  for (const originalLine of lines) {
    const line = toAscii(originalLine);
    if (!line) {
      wrapped.push("");
      continue;
    }

    let current = "";
    for (const word of line.split(/\s+/)) {
      if (current && `${current} ${word}`.length > maxLength) {
        wrapped.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) wrapped.push(current);
  }
  return wrapped;
}

function createPdf(lines) {
  const linesPerPage = 50;
  const printableLines = wrapPdfLines(lines, 86);
  const pages = [];
  for (let index = 0; index < printableLines.length; index += linesPerPage) {
    pages.push(printableLines.slice(index, index + linesPerPage));
  }

  const fontId = 3 + pages.length * 2;
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageIds = pages.map((_, index) => 3 + index * 2);
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  pages.forEach((pageLines, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const textCommands = pageLines
      .map((line) => `(${line.replace(/([\\()])/g, "\\$1")}) Tj\nT*`)
      .join("\n");
    const content = `BT\n/F1 11 Tf\n14 TL\n50 790 Td\n${textCommands}\nET\n`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
  });
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let objectId = 1; objectId < objects.length; objectId += 1) {
    offsets[objectId] = pdf.length;
    pdf += `${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let objectId = 1; objectId < offsets.length; objectId += 1) {
    pdf += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

downloadTextButton.addEventListener("click", () => {
  downloadFile(getGameRecord().join("\r\n"), "text/plain;charset=utf-8", "txt");
});

downloadPdfButton.addEventListener("click", () => {
  downloadFile(createPdf(getGameRecord()), "application/pdf", "pdf");
});

function finishMove(move, promotion) {
  const movingPiece = game.board[move.from.row][move.from.col];
  const takenPiece = move.enPassant
    ? game.board[move.from.row][move.to.col]
    : game.board[move.to.row][move.to.col];
  if (takenPiece) game.captured[game.turn].push({ ...takenPiece });
  applyMove(game, move, promotion);
  selectedSquare = null;
  selectedMoves = [];
  pendingPromotion = null;
  updateGameStatus();
  game.history.push({
    color: movingPiece.color,
    piece: movingPiece.type,
    from: { ...move.from },
    to: { ...move.to },
    capturedPiece: takenPiece && { ...takenPiece },
    castle: move.castle || null,
    promotion: movingPiece.type === "pawn" && (move.to.row === 0 || move.to.row === 7)
      ? promotion || "queen"
      : null,
    check: isInCheck(game, game.turn),
    checkmate: game.finished && isInCheck(game, game.turn),
  });
  renderBoard();
  renderCapturedPieces();
  renderMoveHistory();
}

function chooseSquare(row, col) {
  if (game.finished || pendingPromotion) return;
  const destinationMove = selectedMoves.find((move) => move.to.row === row && move.to.col === col);
  if (destinationMove) {
    const movingPiece = game.board[destinationMove.from.row][destinationMove.from.col];
    if (movingPiece.type === "pawn" && (row === 0 || row === 7)) {
      pendingPromotion = destinationMove;
      showPromotionOptions(movingPiece.color);
    } else {
      finishMove(destinationMove);
    }
    return;
  }

  const piece = game.board[row][col];
  if (piece && piece.color === game.turn) {
    selectedSquare = { row, col };
    selectedMoves = getLegalMoves(game, row, col);
  } else {
    selectedSquare = null;
    selectedMoves = [];
  }
  renderBoard();
}

function showPromotionOptions(color) {
  promotionOptions.replaceChildren();
  for (const type of promotionTypes) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = pieceSymbols[color][type];
    button.setAttribute("aria-label", `Convertir el peón en ${pieceNames[type]}`);
    button.addEventListener("click", () => {
      if (pendingPromotion) finishMove(pendingPromotion, type);
      promotionDialog.close();
    });
    promotionOptions.append(button);
  }
  promotionDialog.showModal();
}

boardElement.addEventListener("click", (event) => {
  const square = event.target.closest(".square");
  if (square) chooseSquare(Number(square.dataset.row), Number(square.dataset.col));
});

restartButton.addEventListener("click", () => {
  if (promotionDialog.open) promotionDialog.close();
  game = newGame();
  selectedSquare = null;
  selectedMoves = [];
  pendingPromotion = null;
  updateGameStatus();
  renderBoard();
  renderCapturedPieces();
  renderMoveHistory();
});

game = newGame();
updateGameStatus();
renderBoard();
renderCapturedPieces();
renderMoveHistory();
