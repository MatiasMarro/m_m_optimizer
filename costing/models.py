from dataclasses import dataclass, field
from typing import Dict, List, Tuple


@dataclass
class HardwareItem:
    nombre: str
    qty: int
    precio_unit: float

    @property
    def total(self) -> float:
        return self.qty * self.precio_unit


@dataclass
class CostBreakdown:
    material_placas: float = 0.0
    material_retazos: float = 0.0
    tapacanto: float = 0.0
    tiempo_cnc: float = 0.0
    mano_obra: float = 0.0
    herrajes: float = 0.0
    margen: float = 0.0

    # Metadata de cálculo (útil para cotización)
    placas_nuevas: int = 0
    retazos_consumidos: int = 0
    metros_tapacanto: float = 0.0
    minutos_cnc: float = 0.0
    horas_mo: float = 0.0
    detalle_herrajes: List[HardwareItem] = field(default_factory=list)

    @property
    def material(self) -> float:
        return self.material_placas + self.material_retazos

    @property
    def subtotal(self) -> float:
        return (
            self.material + self.tapacanto + self.tiempo_cnc
            + self.mano_obra + self.herrajes
        )

    @property
    def total(self) -> float:
        return self.subtotal + self.margen

    def pretty(self) -> str:
        lines = [
            f"Material placas nuevas  ({self.placas_nuevas:>2} u)     ${self.material_placas:>12,.2f}",
            f"Material retazos        ({self.retazos_consumidos:>2} u)     ${self.material_retazos:>12,.2f}",
            f"Tapacanto               ({self.metros_tapacanto:>5.2f} m)   ${self.tapacanto:>12,.2f}",
            f"Tiempo CNC              ({self.minutos_cnc:>5.1f} min) ${self.tiempo_cnc:>12,.2f}",
            f"Mano de obra            ({self.horas_mo:>5.2f} h)   ${self.mano_obra:>12,.2f}",
            f"Herrajes                              ${self.herrajes:>12,.2f}",
            "-" * 52,
            f"Subtotal                              ${self.subtotal:>12,.2f}",
            f"Margen                                ${self.margen:>12,.2f}",
            "=" * 52,
            f"TOTAL                                 ${self.total:>12,.2f}",
        ]
        return "\n".join(lines)
