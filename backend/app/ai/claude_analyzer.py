"""Análisis IA de muebles importados con Claude Opus 4.7.

Recibe metadata estructurada de los layers de un DXF y devuelve un mapping
{layer: role} sugerido. Usa tool use con `strict: true` para garantizar formato.
Aplica prompt caching del system prompt (es estable entre requests).

Uso:
    analyzer = ClaudeAnalyzer()  # lee ANTHROPIC_API_KEY del env
    suggestions = analyzer.suggest_roles(
        furniture_name="Escritorio Bauti",
        material_thickness=18.0,
        layers=[
            LayerInfo(name="CONTORNO", count=4, op_type_distribution={"profile": 4},
                      avg_width=400, avg_height=720, avg_depth=18),
            ...
        ],
    )
    # → {"CONTORNO": "lateral", "TARUGO_8": "skip", ...}
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import anthropic
except ImportError as e:  # pragma: no cover
    raise ImportError(
        "anthropic SDK no instalado. Agregá `anthropic>=0.97` a requirements.txt."
    ) from e


# Roles válidos — alineados con `ROLE_OPTIONS` del frontend (RoleWizardModal.tsx).
# "skip" indica que el layer no debe convertirse a pieza (drills, pockets, marcas).
AVAILABLE_ROLES: tuple[str, ...] = (
    "lateral",
    "tapa",
    "fondo",
    "base",
    "estante",
    "cajón",
    "puerta",
    "zócalo",
    "perfil",
    "skip",
)

_MODEL: str = "claude-opus-4-7"
_TOOL_NAME: str = "assign_roles"

_SYSTEM_PROMPT: str = """Sos un experto en carpintería CNC y diseño de muebles. Tu tarea es asignar el rol correcto a cada layer de un DXF exportado desde Vectric Aspire.

CONTEXTO DEL DOMINIO:
- Los muebles se construyen con tableros de MDF/melamina (espesor típico 18mm).
- Cada layer del DXF agrupa contornos del mismo tipo de operación CNC.
- Tipos de operación (op_type):
  · "profile" → corte exterior pasante (la pieza misma); Z ≈ espesor del material.
  · "pocket" → cajeo parcial; 0 < Z < espesor.
  · "drill" → agujero (círculo); puede ser pasante o ciego.
  · "groove" → ranura.
  · "reference" → marca/cota auxiliar (no se mecaniza).

ROLES DE PIEZA (usá EXACTAMENTE estos strings):
- "lateral": panel vertical lateral del mueble (alto × profundidad). Veta vertical → grain_locked.
- "tapa": panel horizontal superior (ancho × profundidad).
- "base": panel horizontal inferior (ancho × profundidad). Similar a tapa.
- "fondo": panel posterior delgado (ancho × alto). Suele ser más fino que el resto.
- "estante": estante interior horizontal, retraído del frente (ancho × profundidad menos retiro).
- "cajón": frente o lateral de cajón.
- "puerta": frente abatible o corredizo.
- "zócalo": pieza inferior decorativa que tapa la base.
- "perfil": pieza secundaria, listón, refuerzo.
- "skip": el layer NO es una pieza (drills, pockets, marcas, cotas, agujeros de tarugo).

REGLAS DE DECISIÓN:
1. Layers con op_type mayoritariamente "drill", "pocket", "groove" o "reference" → "skip".
2. Layers cuyo nombre contenga keywords como "TARUGO", "MINIFIX", "MECHA", "AGUJ", "DRILL", "RANURA", "GRABADO", "COTA", "GUIA" → "skip".
3. Layers con op_type "profile" son candidatos a piezas. Inferí el rol por:
   - Dimensiones (ancho × alto) y proporción.
   - Cantidad (count): 2 piezas idénticas suelen ser "lateral".
   - Nombre del layer: "CONTORNO", "PLACA", "PIEZA", "CORTE" → genérico, decidir por dims.
4. En caso de duda razonable, usá "skip" antes que adivinar mal — el usuario puede corregir.
5. Considerá el contexto del mueble: el `furniture_name` puede tener pistas ("Escritorio", "Estante", "Cajonera").

DEVOLVÉ siempre todos los layers del input — uno por uno, con su rol asignado."""


@dataclass
class LayerInfo:
    """Metadata de un layer para enviar al modelo. JSON-serializable."""
    name: str
    count: int
    op_type_distribution: dict[str, int] = field(default_factory=dict)
    avg_width: Optional[float] = None
    avg_height: Optional[float] = None
    avg_depth: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "count": self.count,
            "op_type_distribution": dict(self.op_type_distribution),
            "avg_width_mm": self.avg_width,
            "avg_height_mm": self.avg_height,
            "avg_depth_mm": self.avg_depth,
        }


class ClaudeAPIKeyMissingError(RuntimeError):
    """Levantada cuando no hay API key disponible (ni env ni config)."""


def _resolve_api_key(explicit: Optional[str], config_path: Optional[Path]) -> str:
    """Resuelve la API key con precedencia: explicit > env > config.json."""
    if explicit:
        return explicit
    env = os.environ.get("ANTHROPIC_API_KEY")
    if env:
        return env
    if config_path and config_path.exists():
        try:
            cfg = json.loads(config_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            cfg = {}
        key = cfg.get("anthropic_api_key")
        if key:
            return str(key)
    raise ClaudeAPIKeyMissingError(
        "ANTHROPIC_API_KEY no encontrada. Definila como variable de entorno "
        "o agregá `anthropic_api_key` a data/config.json."
    )


def _build_tool_schema(layer_names: list[str]) -> dict:
    """Schema strict del tool. Cada layer recibe su propio campo enum."""
    properties = {
        name: {
            "type": "string",
            "enum": list(AVAILABLE_ROLES),
            "description": f"Rol asignado al layer '{name}'.",
        }
        for name in layer_names
    }
    return {
        "name": _TOOL_NAME,
        "description": (
            "Asigna un rol de carpintería a cada layer del mueble. "
            "Devolvé EXACTAMENTE un campo por cada layer recibido."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": properties,
            "required": list(layer_names),
            "additionalProperties": False,
        },
    }


class ClaudeAnalyzer:
    """Cliente para análisis de muebles con Claude Opus 4.7."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        config_path: Optional[Path] = None,
    ):
        resolved = _resolve_api_key(api_key, config_path)
        self._client = anthropic.Anthropic(api_key=resolved)

    def suggest_roles(
        self,
        furniture_name: str,
        material_thickness: float,
        layers: list[LayerInfo],
        text_annotations: Optional[list[dict]] = None,
    ) -> dict[str, str]:
        """Llama a Claude y devuelve {layer_name: role}.

        Levanta `anthropic.APIError` (subclase de Exception) si la llamada falla.
        """
        if not layers:
            return {}

        # System prompt cacheado (~1.5K tokens, estable entre requests).
        system_blocks = [
            {
                "type": "text",
                "text": _SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ]

        user_payload: dict = {
            "furniture_name": furniture_name,
            "material_thickness_mm": material_thickness,
            "layers": [layer.to_dict() for layer in layers],
        }
        # Cotas y textos del DXF — contexto extra. Limito a 30 entradas para no inflar el prompt.
        if text_annotations:
            cleaned = [
                {"layer": a.get("layer"), "text": a.get("text"), "kind": a.get("kind")}
                for a in text_annotations
                if isinstance(a, dict) and a.get("text")
            ][:30]
            if cleaned:
                user_payload["text_annotations"] = cleaned
        user_text = (
            "Asigná un rol a cada layer del siguiente mueble. "
            "Devolvé el resultado vía la herramienta `assign_roles`.\n\n"
            f"```json\n{json.dumps(user_payload, ensure_ascii=False, indent=2)}\n```"
        )

        layer_names = [layer.name for layer in layers]
        tool = _build_tool_schema(layer_names)

        response = self._client.messages.create(
            model=_MODEL,
            max_tokens=4096,
            system=system_blocks,
            tools=[tool],
            tool_choice={"type": "tool", "name": _TOOL_NAME},
            messages=[{"role": "user", "content": user_text}],
        )

        for block in response.content:
            if getattr(block, "type", None) == "tool_use" and block.name == _TOOL_NAME:
                raw = block.input or {}
                # Filtrar a roles válidos por seguridad (strict ya lo garantiza,
                # pero defendemos contra cambios futuros del schema).
                cleaned: dict[str, str] = {}
                for layer_name in layer_names:
                    val = raw.get(layer_name)
                    if isinstance(val, str) and val in AVAILABLE_ROLES:
                        cleaned[layer_name] = val
                    else:
                        cleaned[layer_name] = "skip"
                return cleaned

        raise RuntimeError(
            "Claude no devolvió un tool_use válido. "
            f"stop_reason={response.stop_reason}, content={response.content!r}"
        )


def suggest_roles(
    furniture_name: str,
    material_thickness: float,
    layers: list[LayerInfo],
    *,
    text_annotations: Optional[list[dict]] = None,
    api_key: Optional[str] = None,
    config_path: Optional[Path] = None,
) -> dict[str, str]:
    """Helper funcional. Crea un cliente y delega."""
    return ClaudeAnalyzer(api_key=api_key, config_path=config_path).suggest_roles(
        furniture_name=furniture_name,
        material_thickness=material_thickness,
        layers=layers,
        text_annotations=text_annotations,
    )
