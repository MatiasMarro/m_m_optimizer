from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List

from nesting.models import Piece
from .holes import HardwareConfig

MDF_THICKNESS = 18.0
BACK_INSET = 10.0
SHELF_INSET = 2.0


@dataclass
class Furniture(ABC):
    ancho: float
    alto: float
    profundidad: float
    espesor: float = MDF_THICKNESS
    hardware: HardwareConfig = field(default_factory=HardwareConfig)

    def __post_init__(self):
        if self.ancho <= 2 * self.espesor:
            raise ValueError("ancho <= 2*espesor")
        if self.profundidad <= 0 or self.alto <= 0:
            raise ValueError("dimensiones invalidas")

    @abstractmethod
    def get_pieces(self) -> List[Piece]: ...
