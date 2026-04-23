from nesting import NestingOptimizer, Sheet
from nesting.config import STANDARD_SHEET_W, STANDARD_SHEET_H
from parametric.cabinet import Cabinet
from costing import CostCalculator, HardwareItem


def main():
    mueble = Cabinet(ancho=800, alto=1800, profundidad=400, num_estantes=2)
    pieces = mueble.get_pieces()

    # Marcar cantos visibles (frente) en laterales y tapa
    for p in pieces:
        if p.name == "lateral":
            p.edged = (False, True, False, False)   # canto frontal
        elif p.name == "tapa":
            p.edged = (True, False, False, False)   # canto frontal
        elif p.name == "estante":
            p.edged = (True, False, False, False)   # canto frontal

    std = Sheet(id="MDF18", width=STANDARD_SHEET_W, height=STANDARD_SHEET_H)
    layout = NestingOptimizer().optimize(pieces, standard_sheet=std)

    herrajes = [
        HardwareItem("bisagra cazoleta", 4, 1200),
        HardwareItem("tornillos aglom.", 40, 25),
    ]

    costo = CostCalculator().compute(layout, pieces, horas_mo=5, herrajes=herrajes)
    print(f"Cabinet {mueble.ancho}x{mueble.alto}x{mueble.profundidad}")
    print(f"Piezas: {sum(p.qty for p in pieces)}  |  Eficiencia nesting: {layout.efficiency:.1%}")
    print()
    print(costo.pretty())


if __name__ == "__main__":
    main()
