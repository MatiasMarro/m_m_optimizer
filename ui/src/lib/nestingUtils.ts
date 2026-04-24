import type { PlacedPiece, SheetUsage } from "./types";

export const snapToKerf = (v: number, kerf: number): number => {
  if (kerf <= 0) return v;
  return Math.round(v / kerf) * kerf;
};

export const clampToSheet = (
  x: number,
  y: number,
  pieceW: number,
  pieceH: number,
  sheetW: number,
  sheetH: number,
): { x: number; y: number } => ({
  x: Math.max(0, Math.min(x, sheetW - pieceW)),
  y: Math.max(0, Math.min(y, sheetH - pieceH)),
});

export const computeSheetEfficiency = (sheet: SheetUsage): number => {
  const total = sheet.sheet_width * sheet.sheet_height;
  if (total <= 0) return 0;
  const used = sheet.placed.reduce((n, p) => n + p.width * p.height, 0);
  return used / total;
};

export const computeSheetOffsets = (
  sheets: SheetUsage[],
  gap: number,
): number[] => {
  const offsets: number[] = [];
  let acc = 0;
  for (const s of sheets) {
    offsets.push(acc);
    acc += s.sheet_width + gap;
  }
  return offsets;
};

/**
 * Decide which sheet receives a drop based on the piece's *center* in world coords.
 * Returns `null` if the center falls outside every sheet (drop is invalid).
 */
export const findDropSheet = (
  worldX: number,
  worldY: number,
  pieceW: number,
  pieceH: number,
  sheets: SheetUsage[],
  sheetOffsets: number[],
): { idx: number; localX: number; localY: number } | null => {
  const cx = worldX + pieceW / 2;
  const cy = worldY + pieceH / 2;
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    const ox = sheetOffsets[i];
    if (cx >= ox && cx <= ox + s.sheet_width && cy >= 0 && cy <= s.sheet_height) {
      return { idx: i, localX: worldX - ox, localY: worldY };
    }
  }
  return null;
};

/**
 * Hypothetical efficiency of a sheet if `excludePieceIdx` were removed and
 * `includePiece` added. Used to show live % while dragging without mutating the store.
 */
export const previewEfficiency = (
  sheet: SheetUsage,
  excludePieceIdx: number | null,
  includePiece: Pick<PlacedPiece, "width" | "height"> | null,
): number => {
  const total = sheet.sheet_width * sheet.sheet_height;
  if (total <= 0) return 0;
  let used = 0;
  sheet.placed.forEach((p, i) => {
    if (i !== excludePieceIdx) used += p.width * p.height;
  });
  if (includePiece) used += includePiece.width * includePiece.height;
  return used / total;
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Two pieces are "too close" if the gap between them on both axes is < kerf.
 * Strict inequalities → pieces that exactly touch kerf distance are OK.
 */
export const piecesCollide = (a: Rect, b: Rect, kerf: number): boolean =>
  !(
    a.x + a.width + kerf <= b.x ||
    b.x + b.width + kerf <= a.x ||
    a.y + a.height + kerf <= b.y ||
    b.y + b.height + kerf <= a.y
  );

export const hasCollision = (
  piece: Rect,
  sheet: SheetUsage,
  excludePieceIdx: number | null,
  kerf: number,
): boolean =>
  sheet.placed.some(
    (p, i) =>
      i !== excludePieceIdx &&
      piecesCollide(piece, { x: p.x, y: p.y, width: p.width, height: p.height }, kerf),
  );

interface SnapInput {
  /** world-coord X of the dragged piece (local = world - sheetOffsetX) */
  worldX: number;
  worldY: number;
  pieceW: number;
  pieceH: number;
  sheet: SheetUsage;
  excludePieceIdx: number | null;
  sheetOffsetX: number;
  kerf: number;
  /** snap threshold in world units (convert from px via threshold / scale) */
  snapThreshold: number;
}

/**
 * Snap assist during drag. Candidates include:
 *  - sheet edges
 *  - neighbor edges offset by kerf (placement with kerf gap)
 *  - neighbor alignment (same left / right / top / bottom / center)
 *
 * Picks independently per axis, then prefers the combination that doesn't collide.
 * Falls back to the free position (clamped) — collision at that point is left
 * for the caller to handle (via `resolveDropPosition`).
 */
export const applyDragSnap = ({
  worldX,
  worldY,
  pieceW,
  pieceH,
  sheet,
  excludePieceIdx,
  sheetOffsetX,
  kerf,
  snapThreshold,
}: SnapInput): { worldX: number; worldY: number } => {
  const localX = worldX - sheetOffsetX;
  const localY = worldY;

  const xCandidates: number[] = [0, sheet.sheet_width - pieceW];
  const yCandidates: number[] = [0, sheet.sheet_height - pieceH];

  sheet.placed.forEach((p, i) => {
    if (i === excludePieceIdx) return;
    // kerf-adjacent placements (no overlap by construction)
    xCandidates.push(p.x + p.width + kerf, p.x - pieceW - kerf);
    yCandidates.push(p.y + p.height + kerf, p.y - pieceH - kerf);
    // alignment candidates (may overlap — collision check handles it)
    xCandidates.push(p.x, p.x + p.width - pieceW, p.x + (p.width - pieceW) / 2);
    yCandidates.push(p.y, p.y + p.height - pieceH, p.y + (p.height - pieceH) / 2);
  });

  const pickNearest = (curr: number, cands: number[]): number => {
    let best = curr;
    let bestD = snapThreshold;
    for (const c of cands) {
      const d = Math.abs(c - curr);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  };

  const snappedX = pickNearest(localX, xCandidates);
  const snappedY = pickNearest(localY, yCandidates);

  // Prefer (both snapped). If collides, try one axis snapped; if still collides,
  // fall back to free (collision is resolved later by caller).
  const attempts: Array<[number, number]> = [
    [snappedX, snappedY],
    [snappedX, localY],
    [localX, snappedY],
    [localX, localY],
  ];

  for (const [cx, cy] of attempts) {
    const clamped = clampToSheet(
      cx,
      cy,
      pieceW,
      pieceH,
      sheet.sheet_width,
      sheet.sheet_height,
    );
    const piece: Rect = {
      x: clamped.x,
      y: clamped.y,
      width: pieceW,
      height: pieceH,
    };
    if (!hasCollision(piece, sheet, excludePieceIdx, kerf)) {
      return { worldX: sheetOffsetX + clamped.x, worldY: clamped.y };
    }
  }

  const clampedFree = clampToSheet(
    localX,
    localY,
    pieceW,
    pieceH,
    sheet.sheet_width,
    sheet.sheet_height,
  );
  return { worldX: sheetOffsetX + clampedFree.x, worldY: clampedFree.y };
};

/**
 * Grid-search the sheet starting at (targetX, targetY) in kerf-step rings,
 * returning the nearest collision-free position. Returns null if none exists
 * within the sheet bounds.
 */
export const findNearestValidPosition = (
  targetX: number,
  targetY: number,
  pieceW: number,
  pieceH: number,
  sheet: SheetUsage,
  excludePieceIdx: number | null,
  kerf: number,
): { x: number; y: number } | null => {
  const step = Math.max(kerf, 1);
  const maxX = sheet.sheet_width - pieceW;
  const maxY = sheet.sheet_height - pieceH;
  if (maxX < 0 || maxY < 0) return null;

  const startX = Math.max(0, Math.min(snapToKerf(targetX, step), maxX));
  const startY = Math.max(0, Math.min(snapToKerf(targetY, step), maxY));

  const test = (x: number, y: number): { x: number; y: number } | null => {
    const piece: Rect = { x, y, width: pieceW, height: pieceH };
    return hasCollision(piece, sheet, excludePieceIdx, kerf) ? null : { x, y };
  };

  const hit0 = test(startX, startY);
  if (hit0) return hit0;

  const maxR = Math.max(
    Math.ceil(sheet.sheet_width / step),
    Math.ceil(sheet.sheet_height / step),
  );

  const seen = new Set<string>();
  for (let r = 1; r <= maxR; r++) {
    // Iterate the ring at distance r; visit closest-to-center cells first
    // by sorting by Euclidean distance within the ring.
    const ring: Array<[number, number, number]> = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        ring.push([dx, dy, dx * dx + dy * dy]);
      }
    }
    ring.sort((a, b) => a[2] - b[2]);
    for (const [dx, dy] of ring) {
      const cx = Math.max(0, Math.min(startX + dx * step, maxX));
      const cy = Math.max(0, Math.min(startY + dy * step, maxY));
      const key = `${cx},${cy}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const hit = test(cx, cy);
      if (hit) return hit;
    }
  }
  return null;
};

/**
 * Full drop resolution: snap + kerf round + clamp + collision check.
 * If the snapped position collides, try to auto-resolve by pushing to the
 * nearest valid spot. Returns null if the piece cannot fit anywhere on the sheet.
 */
export const resolveDropPosition = (
  worldX: number,
  worldY: number,
  pieceW: number,
  pieceH: number,
  sheet: SheetUsage,
  excludePieceIdx: number | null,
  sheetOffsetX: number,
  kerf: number,
  snapThreshold: number,
): { x: number; y: number } | null => {
  const snapped = applyDragSnap({
    worldX,
    worldY,
    pieceW,
    pieceH,
    sheet,
    excludePieceIdx,
    sheetOffsetX,
    kerf,
    snapThreshold,
  });
  const localX = snapToKerf(snapped.worldX - sheetOffsetX, kerf);
  const localY = snapToKerf(snapped.worldY, kerf);
  const clamped = clampToSheet(
    localX,
    localY,
    pieceW,
    pieceH,
    sheet.sheet_width,
    sheet.sheet_height,
  );
  const piece: Rect = {
    x: clamped.x,
    y: clamped.y,
    width: pieceW,
    height: pieceH,
  };
  if (!hasCollision(piece, sheet, excludePieceIdx, kerf)) {
    return clamped;
  }
  return findNearestValidPosition(
    clamped.x,
    clamped.y,
    pieceW,
    pieceH,
    sheet,
    excludePieceIdx,
    kerf,
  );
};
