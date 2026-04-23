import pytest

from main import ProjectResult, run_pipeline
from parametric.cabinet import Cabinet


def test_run_pipeline_returns_project_result_with_layout_costo_pieces(cabinet_600):
    result = run_pipeline(cabinet_600)
    assert isinstance(result, ProjectResult)
    assert result.layout is not None
    assert result.costo is not None
    assert len(result.pieces) > 0


def test_run_pipeline_warnings_is_always_a_list(cabinet_600):
    result = run_pipeline(cabinet_600)
    assert isinstance(result.warnings, list)


def test_run_pipeline_dxf_path_is_none_when_not_requested(cabinet_600):
    result = run_pipeline(cabinet_600)
    assert result.dxf_path is None


def test_run_pipeline_propagates_invalid_cabinet_error():
    with pytest.raises(ValueError):
        Cabinet(ancho=30, alto=720, profundidad=400)
