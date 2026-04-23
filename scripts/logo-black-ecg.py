#!/usr/bin/env python3
"""Ajusta public/traza-heart-mark.png: corazón blanco, trazo ECG negro, borde verde intacto.

- Relleno: píxeles opacos dentro del bbox del corazón que no son contorno verde ni halo menta.
- Trazo: polilínea negra tipo QRS centrada en el bbox (idempotente: vuelve a pintar encima).

Desde la raíz: python3 scripts/logo-black-ecg.py
"""
from __future__ import annotations

from PIL import Image, ImageDraw


def is_outline_green(r: int, g: int, b: int, a: int) -> bool:
    """Contorno del corazón (no el halo menta claro, que tiene R alto)."""
    return a > 200 and r <= 135 and g >= r + 12 and g >= b + 6


def is_mint_halo(r: int, g: int, b: int, a: int) -> bool:
    """Bordes suaves del cuadrado menta; no deben pasarse a blanco."""
    return a >= 32 and r + g + b > 400 and g > 190


def heart_bbox() -> tuple[int, int, int, int]:
    """BBox fija del interior opaco (derivada del asset 1024×1024 actual)."""
    return 233, 235, 782, 723


def ecg_polyline(x0: int, y0: int, x1: int, y1: int) -> list[tuple[int, int]]:
    w, h = x1 - x0 + 1, y1 - y0 + 1
    y_base = y0 + int(h * 0.48)
    y_peak = y0 + int(h * 0.28)
    y_valley = y0 + int(h * 0.62)
    xa = x0 + int(w * 0.08)
    xb = x0 + int(w * 0.32)
    xc = x0 + int(w * 0.42)
    xd = x0 + int(w * 0.52)
    xe = x0 + int(w * 0.62)
    xf = x1 - int(w * 0.06)
    return [
        (xa, y_base),
        (xb, y_base),
        (xc, y_peak),
        (xd, y_valley),
        (xe, y_base),
        (xf, y_base),
    ]


def main() -> None:
    path = "public/traza-heart-mark.png"
    im = Image.open(path).convert("RGBA")
    px = im.load()
    w, h = im.size
    xmin, ymin, xmax, ymax = heart_bbox()

    filled = 0
    for y in range(ymin, ymax + 1):
        for x in range(xmin, xmax + 1):
            r, g, b, a = px[x, y]
            if a < 32:
                continue
            if is_outline_green(r, g, b, a):
                continue
            if is_mint_halo(r, g, b, a):
                continue
            if a > 200 or r + g + b < 120:
                px[x, y] = (255, 255, 255, min(255, a))
                filled += 1

    pts = ecg_polyline(xmin, ymin, xmax, ymax)
    stroke = max(10, int((xmax - xmin + 1) * 0.028))
    draw = ImageDraw.Draw(im)
    draw.line(pts, fill=(0, 0, 0, 255), width=stroke, joint="curve")

    im.save(path, optimize=True)
    print(path, "→ relleno blanco:", filled, "| trazo ECG negro, grosor", stroke)


if __name__ == "__main__":
    main()
