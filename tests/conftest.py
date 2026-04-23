import pytest

from nesting.models import Sheet
from nesting.optimizer import NestingOptimizer
from parametric.cabinet import Cabinet
from parametric.shelving import ShelvingUnit


@pytest.fixture(autouse=True)
def _isolate_inventory_cwd(tmp_path, monkeypatch):
    # INVENTORY_PATH es relativo al CWD ("data/offcuts.json"): saltamos a un tmp
    # para que OffcutInventory nunca lea/escriba el archivo real del proyecto.
    monkeypatch.chdir(tmp_path)


@pytest.fixture
def std_sheet() -> Sheet:
    return Sheet(id="TEST", width=1830, height=2440)


@pytest.fixture
def cabinet_600() -> Cabinet:
    return Cabinet(ancho=600, alto=720, profundidad=400, num_estantes=2)


@pytest.fixture
def shelving_800() -> ShelvingUnit:
    return ShelvingUnit(ancho=800, alto=1800, profundidad=300, num_estantes=3)


@pytest.fixture
def cabinet_pieces(cabinet_600):
    return cabinet_600.get_pieces()


@pytest.fixture
def cabinet_layout(cabinet_pieces, std_sheet):
    return NestingOptimizer().optimize(cabinet_pieces, std_sheet, offcuts=[])
