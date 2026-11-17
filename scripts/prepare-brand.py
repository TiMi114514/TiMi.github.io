"""Generate the site logo and favicons from the supplied dx mark."""

from __future__ import annotations

import sys

from PIL import Image, ImageChops


def cropped_mark(source: Image.Image) -> Image.Image:
    rgb = source.convert("RGB")
    gray = rgb.convert("L")
    # The mark is white on black; find the white glyph bounds.
    mask = gray.point(lambda value: 255 if value > 24 else 0)
    bbox = mask.getbbox()
    if not bbox:
        return rgb
    return rgb.crop(bbox)


def square_canvas(mark: Image.Image, size: int, padding: float = 0.12) -> Image.Image:
    width, height = mark.size
    target = max(1, int(size * (1 - padding * 2)))
    scale = min(target / width, target / height)
    resized = mark.resize(
        (max(1, int(width * scale)), max(1, int(height * scale))),
        Image.LANCZOS,
    )
    canvas = Image.new("RGB", (size, size), (0, 0, 0))
    canvas.paste(
        resized,
        ((size - resized.width) // 2, (size - resized.height) // 2),
    )
    return canvas


def main() -> None:
    source_path, logo_path, favicon_path, apple_path = sys.argv[1:5]
    source = Image.open(source_path)
    mark = cropped_mark(source)
    square_canvas(mark, 512).save(logo_path, "PNG", optimize=True)
    square_canvas(mark, 256).save(favicon_path, "PNG", optimize=True)
    square_canvas(mark, 180).save(apple_path, "PNG", optimize=True)
    print("mark bbox:", mark.size)


if __name__ == "__main__":
    main()
