"""Render Agora's monochrome metallic orb to PNG for web and native apps.

Requires Pillow: python3 -m pip install Pillow
Run with: pnpm --filter @agora/web icons:brand
"""

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[3]
WEB = ROOT / "apps/web/public"
MOBILE = ROOT / "apps/mobile/assets/images"
BRAND = ROOT / "assets/brand"
BACKGROUND = (12, 12, 12, 255)
SCALE = 2


def metallic_value(position: float) -> float:
    """Broad, restrained silver bands instead of a glossy chrome highlight."""
    stops = [(0.0, 32), (0.18, 103), (0.35, 218), (0.49, 174), (0.65, 54), (0.82, 155), (1.0, 30)]
    for (left, start), (right, end) in zip(stops, stops[1:]):
        if position <= right:
            t = max(0.0, (position - left) / (right - left))
            t = t * t * (3 - 2 * t)
            return start + (end - start) * t
    return stops[-1][1]


def metallic_orb() -> Image.Image:
    """A grayscale spherical surface with a soft diagonal metal reflection."""
    side = 1024
    values = bytearray(side * side)
    for y in range(side):
        ny = (y - 512) / 342
        for x in range(side):
            nx = (x - 512) / 342
            position = max(0.0, min(1.0, (nx + 0.35 * ny + 1.35) / 2.7))
            radial = min(1.0, nx * nx + ny * ny)
            value = metallic_value(position) * (1 - 0.28 * radial) - 10 * ny
            values[y * side + x] = max(0, min(255, round(value)))
    silver = Image.frombytes("L", (side, side), bytes(values))
    return silver.convert("RGBA").resize((side * SCALE, side * SCALE), Image.Resampling.BICUBIC)


def identity() -> tuple[Image.Image, Image.Image]:
    size = 1024 * SCALE
    circle = (170, 170, 854, 854)
    circle_mask = Image.new("L", (size, size))
    ImageDraw.Draw(circle_mask).ellipse(tuple(round(value * SCALE) for value in circle), fill=255)
    symbol = metallic_orb()
    symbol.putalpha(circle_mask)
    symbol = symbol.resize((1024, 1024), Image.Resampling.LANCZOS)
    icon = Image.new("RGBA", symbol.size, BACKGROUND)
    icon.alpha_composite(symbol)
    return icon.convert("RGB"), symbol


def resized(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def save_icon(image: Image.Image, size: int, path: Path) -> None:
    resized(image, size).save(path, "PNG", optimize=True)


icon, symbol = identity()
icon.save(BRAND / "agora-icon-master.png", optimize=True)
symbol.save(BRAND / "agora-symbol-master.png", optimize=True)

for size, filename in [
    (32, "favicon-32.png"),
    (180, "apple-touch-icon.png"),
    (192, "icon-192.png"),
    (512, "icon-512.png"),
]:
    save_icon(icon, size, WEB / filename)
save_icon(icon, 1024, MOBILE / "icon.png")
icon.save(WEB / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])

# Android masks the foreground; keep the illustrated form inside its safe area.
def foreground(size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inset = round(size * 0.75)
    artwork = resized(symbol, inset)
    canvas.alpha_composite(artwork, ((size - inset) // 2, (size - inset) // 2))
    return canvas


foreground(512).save(MOBILE / "android-icon-foreground.png", optimize=True)
foreground(512).save(MOBILE / "splash-icon.png", optimize=True)
mono = foreground(432)
alpha = mono.getchannel("A")
mono = Image.new("RGBA", mono.size, (255, 255, 255, 0))
mono.putalpha(alpha)
mono.save(MOBILE / "android-icon-monochrome.png", optimize=True)

print("Agora raster icons generated for web, iOS, Android and splash screen.")
