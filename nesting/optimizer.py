from typing import List, Optional, Tuple
from rectpack import newPacker, PackingMode, PackingBin, MaxRectsBssf

from .models import Piece, Sheet, PlacedPiece, SheetUsage, Layout, rotate_hole_cw
from .config import KERF, MIN_OFFCUT_SIDE
from .inventory import OffcutInventory


class NestingOptimizer:
    """Nesting 2D estilo Lepton: consume retazos primero (menor a mayor),
    luego placas estándar. Detecta retazos aprovechables post-corte.

    Soporta veta (grain_locked=True) con empaque en 2 fases:
      1. Piezas con veta: rotation=False.
      2. Piezas sin veta: rotation=True, aprovechando huecos de fase 1
         como sub-bins virtuales + offcuts restantes + placas adicionales.
    """

    def __init__(
        self,
        kerf: float = KERF,
        min_offcut: float = MIN_OFFCUT_SIDE,
        inventory: Optional[OffcutInventory] = None,
    ):
        self.kerf = kerf
        self.min_offcut = min_offcut
        self.inventory = inventory

    def optimize(
        self,
        pieces: List[Piece],
        standard_sheet: Sheet,
        offcuts: Optional[List[Sheet]] = None,
    ) -> Layout:
        offcuts = offcuts or []
        locked = [p for p in pieces if p.grain_locked]
        free_pieces = [p for p in pieces if not p.grain_locked]

        if not locked:
            usages, unplaced = self._pack(free_pieces, standard_sheet, offcuts, rotation=True)
            return self._finalize(usages, unplaced)
        if not free_pieces:
            usages, unplaced = self._pack(locked, standard_sheet, offcuts, rotation=False)
            return self._finalize(usages, unplaced)

        # ---- Fase 1: piezas con veta, sin rotación ----
        p1_usages, p1_unplaced = self._pack(
            locked, standard_sheet, offcuts, rotation=False,
        )
        p1_std_count = sum(1 for u in p1_usages if not u.sheet.is_offcut)

        # Sub-bins virtuales = huecos libres de fase 1
        virtual_sheets: List[Sheet] = []
        virtual_map = {}  # virtual_id -> (parent_usage, offset_x, offset_y)
        for usage in p1_usages:
            for i, (x, y, w, h) in enumerate(usage.free_rects):
                vid = f"V::{usage.sheet.id}::{i}"
                virtual_sheets.append(Sheet(
                    id=vid, width=w, height=h,
                    thickness=usage.sheet.thickness, is_offcut=True,
                ))
                virtual_map[vid] = (usage, x, y)

        used_oc_ids = {u.sheet.id for u in p1_usages if u.sheet.is_offcut}
        remaining_offcuts = [oc for oc in offcuts if oc.id not in used_oc_ids]

        # ---- Fase 2: piezas sin veta, con rotación ----
        p2_usages, p2_unplaced = self._pack(
            free_pieces, standard_sheet,
            virtual_sheets + remaining_offcuts,
            rotation=True,
            std_start=p1_std_count + 1,
        )

        # ---- Merge: placements en virtuales → placa padre con offset ----
        new_usages: List[SheetUsage] = []
        for u2 in p2_usages:
            if u2.sheet.id in virtual_map:
                parent, ox, oy = virtual_map[u2.sheet.id]
                for pl in u2.placements:
                    parent.placements.append(PlacedPiece(
                        piece_name=pl.piece_name,
                        sheet_id=parent.sheet.id,
                        x=pl.x + ox,
                        y=pl.y + oy,
                        width=pl.width,
                        height=pl.height,
                        rotated=pl.rotated,
                        holes=list(pl.holes),
                    ))
            else:
                new_usages.append(u2)

        all_usages = list(p1_usages) + new_usages
        all_unplaced = self._merge_unplaced(p1_unplaced, p2_unplaced)
        return self._finalize(all_usages, all_unplaced)

    # ---------- Core pack ----------
    def _pack(
        self,
        pieces: List[Piece],
        standard_sheet: Sheet,
        offcuts: List[Sheet],
        rotation: bool,
        std_start: int = 1,
    ) -> Tuple[List[SheetUsage], List[Piece]]:
        if not pieces:
            return [], []

        expanded = []
        piece_lookup = {}
        rid = 0
        for p in pieces:
            for _ in range(p.qty):
                expanded.append((rid, p, p.width + self.kerf, p.height + self.kerf))
                piece_lookup[rid] = p
                rid += 1

        offcuts_sorted = sorted(offcuts, key=lambda s: s.width * s.height)
        total_area = sum(w * h for _, _, w, h in expanded)
        std_area = standard_sheet.width * standard_sheet.height
        std_needed = int(total_area // std_area) + 2

        packer = newPacker(
            mode=PackingMode.Offline,
            bin_algo=PackingBin.BFF,
            pack_algo=MaxRectsBssf,
            rotation=rotation,
        )
        bin_map = {}
        for oc in offcuts_sorted:
            packer.add_bin(oc.width, oc.height, bid=oc.id)
            bin_map[oc.id] = oc
        for i in range(std_needed):
            idx = std_start + i
            bid = f"STD::{standard_sheet.id}::{idx}"
            packer.add_bin(standard_sheet.width, standard_sheet.height, bid=bid)
            bin_map[bid] = Sheet(
                id=f"{standard_sheet.id}_{idx}",
                width=standard_sheet.width,
                height=standard_sheet.height,
                thickness=standard_sheet.thickness,
                is_offcut=False,
            )

        for rid_, _, w, h in expanded:
            packer.add_rect(w, h, rid=rid_)

        packer.pack()

        usages: List[SheetUsage] = []
        placed_rids = set()
        for abin in packer:
            if len(abin) == 0:
                continue
            sheet = bin_map[abin.bid]
            usage = SheetUsage(sheet=sheet, placements=[])
            max_x, max_y = 0.0, 0.0
            for rect in abin:
                p = piece_lookup[rect.rid]
                rotated = not (
                    abs(rect.width - (p.width + self.kerf)) < 1e-6
                    and abs(rect.height - (p.height + self.kerf)) < 1e-6
                )
                real_w = p.height if rotated else p.width
                real_h = p.width if rotated else p.height
                if p.holes:
                    holes = (
                        [rotate_hole_cw(h, p.width) for h in p.holes]
                        if rotated else list(p.holes)
                    )
                else:
                    holes = []
                usage.placements.append(PlacedPiece(
                    piece_name=p.name,
                    sheet_id=sheet.id,
                    x=rect.x,
                    y=rect.y,
                    width=real_w,
                    height=real_h,
                    rotated=rotated,
                    holes=holes,
                ))
                placed_rids.add(rect.rid)
                max_x = max(max_x, rect.x + rect.width)
                max_y = max(max_y, rect.y + rect.height)

            usage.free_rects = self._compute_free_rects(sheet, max_x, max_y)
            usages.append(usage)

        unplaced_acc = {}
        for rid_, p, _, _ in expanded:
            if rid_ not in placed_rids:
                prev = unplaced_acc.get(p.name)
                unplaced_acc[p.name] = (p, (prev[1] + 1) if prev else 1)
        unplaced = [
            Piece(
                name=p.name, width=p.width, height=p.height, qty=c,
                grain_locked=p.grain_locked, edged=p.edged,
                holes=list(p.holes),
            )
            for p, c in unplaced_acc.values()
        ]
        return usages, unplaced

    def _compute_free_rects(self, sheet: Sheet, max_x: float, max_y: float) -> List[tuple]:
        free = []
        right_w = sheet.width - max_x
        top_h = sheet.height - max_y
        if right_w >= self.min_offcut and sheet.height >= self.min_offcut:
            free.append((max_x, 0, right_w, sheet.height))
        if top_h >= self.min_offcut and max_x >= self.min_offcut:
            free.append((0, max_y, max_x, top_h))
        return free

    def _merge_unplaced(self, a: List[Piece], b: List[Piece]) -> List[Piece]:
        acc = {}
        for p in a + b:
            key = (p.name, p.width, p.height, p.grain_locked, p.edged)
            if key in acc:
                acc[key].qty += p.qty
            else:
                acc[key] = Piece(
                    name=p.name, width=p.width, height=p.height,
                    qty=p.qty, grain_locked=p.grain_locked, edged=p.edged,
                    holes=list(p.holes),
                )
        return list(acc.values())

    def _finalize(
        self,
        usages: List[SheetUsage],
        unplaced: List[Piece],
    ) -> Layout:
        # Recomputar free_rects post-merge
        for u in usages:
            max_x = max((pl.x + pl.width for pl in u.placements), default=0.0)
            max_y = max((pl.y + pl.height for pl in u.placements), default=0.0)
            u.free_rects = self._compute_free_rects(u.sheet, max_x, max_y)

        piece_area = sum(pl.width * pl.height for u in usages for pl in u.placements)
        used_sheet_area = sum(u.sheet.width * u.sheet.height for u in usages)
        efficiency = piece_area / used_sheet_area if used_sheet_area else 0.0

        new_offcuts: List[Sheet] = []
        for u in usages:
            if self.inventory and u.sheet.is_offcut:
                self.inventory.mark_used(u.sheet.id)
            for (x, y, w, h) in u.free_rects:
                if self.inventory:
                    oc = Sheet(
                        id=self.inventory.next_id(),
                        width=w, height=h,
                        thickness=u.sheet.thickness, is_offcut=True,
                    )
                    self.inventory.add(oc, origin_x=x, origin_y=y)
                else:
                    oc = Sheet(
                        id=f"{u.sheet.id}_off_{len(new_offcuts)+1}",
                        width=w, height=h,
                        thickness=u.sheet.thickness, is_offcut=True,
                    )
                new_offcuts.append(oc)
        if self.inventory:
            self.inventory.save()

        return Layout(
            sheets_used=usages,
            unplaced=unplaced,
            efficiency=efficiency,
            new_offcuts=new_offcuts,
        )
