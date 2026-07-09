"""Pillow mask / connected-component / stitch / region helpers.

Pillow is imported lazily so the JSON-only commands (metrics / ingest-verdict / merge-ledger) can run
in environments that do not install Pillow (e.g. the metrics-badge workflow).
"""

from __future__ import annotations

from collections import deque
from pathlib import Path
from typing import Any

from . import context

try:
    from PIL import Image, ImageChops, ImageDraw
except ImportError:  # pragma: no cover - exercised when Pillow is absent
    Image = ImageChops = ImageDraw = None  # type: ignore[assignment]

PILLOW_IMPORT_HINT = "Pillow is required. Install it with: python -m pip install Pillow"

# Threshold defaults mirror .github/visual-triage-config.json; they are only used when a config key
# is missing so the tool degrades gracefully rather than crashing on a partial config.
DEFAULT_PIXEL_CHANNEL_THRESHOLD = 16
DEFAULT_NOISE_CHANGED_AREA_RATIO = 0.001
DEFAULT_CROP_PADDING_PX = 16
DEFAULT_MAX_REGIONS = 4
DEFAULT_MAX_CROP_AREA_RATIO = 0.25
DEFAULT_FOCUS_GRID_ROWS = 3
DEFAULT_FOCUS_GRID_COLS = 3

# Stitched BEFORE|AFTER layout constants.
STITCH_LABEL_HEIGHT = 24
STITCH_DIVIDER_WIDTH = 2

# Connected-component analysis is pure-Python BFS, which is O(pixels). Full-page screenshots can be
# several megapixels, so we locate regions on a mask downscaled to at most this width and map the
# resulting bounding boxes back to original coordinates. Masks at or below this width are analyzed at
# full resolution (so small fixtures behave identically to the un-optimized implementation).
CONNECTED_COMPONENT_MAX_WIDTH = 512


def require_pillow() -> None:
    """Fail only when a command that actually needs Pillow is invoked without it."""
    if Image is None:
        raise SystemExit(PILLOW_IMPORT_HINT)


def _nearest_resample() -> Any:
    resampling = getattr(Image, "Resampling", None)
    return resampling.NEAREST if resampling is not None else Image.NEAREST


def ensure_same_size(before: "Image.Image", after: "Image.Image") -> tuple["Image.Image", "Image.Image"]:
    before = before.convert("RGB")
    after = after.convert("RGB")
    if before.size == after.size:
        return before, after
    width = max(before.width, after.width)
    height = max(before.height, after.height)
    before_canvas = Image.new("RGB", (width, height), "white")
    after_canvas = Image.new("RGB", (width, height), "white")
    before_canvas.paste(before, (0, 0))
    after_canvas.paste(after, (0, 0))
    return before_canvas, after_canvas


def build_mask(before: "Image.Image", after: "Image.Image", channel_threshold: int) -> "Image.Image":
    diff = ImageChops.difference(before, after)
    channels = diff.split()
    max_channel = channels[0]
    for channel in channels[1:]:
        max_channel = ImageChops.lighter(max_channel, channel)
    return max_channel.point(lambda value: 255 if value > channel_threshold else 0, "1")


def bbox_with_padding(bbox: tuple[int, int, int, int], width: int, height: int, padding: int) -> tuple[int, int, int, int]:
    left, top, right, bottom = bbox
    return (
        max(0, left - padding),
        max(0, top - padding),
        min(width, right + padding),
        min(height, bottom + padding),
    )


def connected_components(mask: "Image.Image", max_regions: int, padding: int) -> list[dict[str, Any]]:
    orig_width, orig_height = mask.size

    # Downscale wide masks before the BFS, then map bounding boxes back to original coordinates.
    work = mask
    scale_x = scale_y = 1.0
    if orig_width > CONNECTED_COMPONENT_MAX_WIDTH:
        new_width = CONNECTED_COMPONENT_MAX_WIDTH
        new_height = max(1, round(orig_height * new_width / orig_width))
        work = mask.resize((new_width, new_height), _nearest_resample())
        scale_x = orig_width / new_width
        scale_y = orig_height / new_height

    width, height = work.size
    pixels = work.load()
    visited = bytearray(width * height)
    components: list[dict[str, Any]] = []

    union_bbox = work.getbbox()
    if not union_bbox:
        return []
    scan_left, scan_top, scan_right, scan_bottom = union_bbox

    for y in range(scan_top, scan_bottom):
        for x in range(scan_left, scan_right):
            idx = y * width + x
            if visited[idx] or not pixels[x, y]:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[idx] = 1
            count = 0
            left = right = x
            top = bottom = y
            while queue:
                cx, cy = queue.popleft()
                count += 1
                left = min(left, cx)
                right = max(right, cx)
                top = min(top, cy)
                bottom = max(bottom, cy)
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    nidx = ny * width + nx
                    if visited[nidx] or not pixels[nx, ny]:
                        continue
                    visited[nidx] = 1
                    queue.append((nx, ny))
            # Map the work-resolution bbox (right/bottom exclusive) back to original coordinates.
            orig_bbox = (
                int(left * scale_x),
                int(top * scale_y),
                min(orig_width, int(round((right + 1) * scale_x))),
                min(orig_height, int(round((bottom + 1) * scale_y))),
            )
            padded = bbox_with_padding(orig_bbox, orig_width, orig_height, padding)
            changed_pixels = int(round(count * scale_x * scale_y))
            components.append({"bbox": padded, "changed_pixels": changed_pixels})

    return sorted(components, key=lambda item: item["changed_pixels"], reverse=True)[:max_regions]


def stitch(before: "Image.Image", after: "Image.Image", bbox: tuple[int, int, int, int], output: Path) -> None:
    label_height = STITCH_LABEL_HEIGHT
    divider_width = STITCH_DIVIDER_WIDTH
    left_crop = before.crop(bbox)
    right_crop = after.crop(bbox)
    width = left_crop.width + right_crop.width + divider_width
    height = max(left_crop.height, right_crop.height) + label_height
    canvas = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, width, label_height), fill=(245, 245, 245))
    draw.text((8, 6), "BEFORE", fill=(0, 0, 0))
    draw.text((left_crop.width + divider_width + 8, 6), "AFTER", fill=(0, 0, 0))
    canvas.paste(left_crop, (0, label_height))
    draw.rectangle((left_crop.width, 0, left_crop.width + divider_width - 1, height), fill=(40, 40, 40))
    canvas.paste(right_crop, (left_crop.width + divider_width, label_height))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def region_location(bbox: tuple[int, int, int, int], width: int, height: int) -> str:
    left, top, right, bottom = bbox
    cx = (left + right) / 2
    cy = (top + bottom) / 2
    horizontal = "left" if cx < width / 3 else "right" if cx > 2 * width / 3 else "center"
    vertical = "top" if cy < height / 3 else "bottom" if cy > 2 * height / 3 else "middle"
    return f"{vertical}-{horizontal}"


def crop_area_ratio(bbox: tuple[int, int, int, int], width: int, height: int) -> float:
    left, top, right, bottom = bbox
    total = width * height
    return ((right - left) * (bottom - top) / total) if total else 0


def score_mask_region(mask: "Image.Image", bbox: tuple[int, int, int, int]) -> int:
    return int(mask.crop(bbox).histogram()[255])


def split_focus_regions(
    mask: "Image.Image",
    bbox: tuple[int, int, int, int],
    max_regions: int,
    padding: int,
    grid_rows: int,
    grid_cols: int,
) -> list[dict[str, Any]]:
    """Split a very large changed area into the densest smaller tiles.

    This avoids sending a full-page screenshot to the issue agent while still preserving the most
    informative visual evidence. Tiles are scored by changed-pixel count and then padded for context.
    """
    width, height = mask.size
    left, top, right, bottom = bbox
    candidates: list[dict[str, Any]] = []
    grid_rows = max(1, grid_rows)
    grid_cols = max(1, grid_cols)
    for row in range(grid_rows):
        tile_top = top + (bottom - top) * row // grid_rows
        tile_bottom = top + (bottom - top) * (row + 1) // grid_rows
        for col in range(grid_cols):
            tile_left = left + (right - left) * col // grid_cols
            tile_right = left + (right - left) * (col + 1) // grid_cols
            tile = (tile_left, tile_top, tile_right, tile_bottom)
            score = score_mask_region(mask, tile)
            if score <= 0:
                continue
            candidates.append({
                "bbox": bbox_with_padding(tile, width, height, padding),
                "changed_pixels": score,
                "mode": "focused_tile",
            })
    if not candidates:
        return [{"bbox": bbox_with_padding(bbox, width, height, padding), "changed_pixels": 0, "mode": "focused_tile_fallback"}]

    deduped: list[dict[str, Any]] = []
    seen: set[tuple[int, int, int, int]] = set()
    for candidate in sorted(candidates, key=lambda item: item["changed_pixels"], reverse=True):
        key = tuple(candidate["bbox"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
        if len(deduped) >= max_regions:
            break
    return deduped


def build_evidence_regions(mask: "Image.Image", config: dict[str, Any]) -> list[dict[str, Any]]:
    thresholds = config.get("thresholds", {})
    max_regions = int(thresholds.get("max_regions", DEFAULT_MAX_REGIONS))
    padding = int(thresholds.get("crop_padding_px", DEFAULT_CROP_PADDING_PX))
    max_crop_area = float(thresholds.get("max_crop_area_ratio", DEFAULT_MAX_CROP_AREA_RATIO))
    grid_rows = int(thresholds.get("focus_grid_rows", DEFAULT_FOCUS_GRID_ROWS))
    grid_cols = int(thresholds.get("focus_grid_cols", DEFAULT_FOCUS_GRID_COLS))
    width, height = mask.size

    components = connected_components(mask, max_regions=max_regions * grid_rows * grid_cols, padding=padding)
    regions: list[dict[str, Any]] = []
    for component in components:
        bbox = tuple(component["bbox"])
        if crop_area_ratio(bbox, width, height) > max_crop_area:
            regions.extend(split_focus_regions(mask, bbox, max_regions, padding, grid_rows, grid_cols))
        else:
            regions.append({**component, "mode": "connected_component"})
        if len(regions) >= max_regions:
            break

    return sorted(regions, key=lambda item: item.get("changed_pixels", 0), reverse=True)[:max_regions]


def enrich_region(
    region: dict[str, Any],
    width: int,
    height: int,
    route: str,
    component_name: str,
    index: int,
    total: int,
) -> dict[str, Any]:
    bbox = tuple(region["bbox"])
    route_ctx = context.route_context(route, component_name)
    return {
        "bbox": list(bbox),
        "location": region_location(bbox, width, height),
        "component_hint": route_ctx["component_hint"],
        "component_purpose": route_ctx["purpose"],
        "crop_strategy": region.get("mode", "connected_component"),
        "changed_pixels": region.get("changed_pixels"),
        "evidence_note": (
            f"Focused crop {index}/{total} around the highest-density changed pixels in the "
            f"{region_location(bbox, width, height)} of route `{route}`. Inspect this local BEFORE/AFTER "
            "region first; only open full artifacts if the crop is ambiguous."
        ),
    }


def classify_images(
    before_raw: "Image.Image",
    after_raw: "Image.Image",
    config: dict[str, Any],
    crop_path: Path,
) -> dict[str, Any]:
    """Classify whether one before/after pair needs an issue-scanning agent.

    This intentionally does not distinguish intended UI changes from regressions. The only CI-side
    decision is whether the diff is small enough to be ignored as noise, or large enough to package
    for the downstream issue agent.
    """
    thresholds = config.get("thresholds", {})
    before, after = ensure_same_size(before_raw, after_raw)
    mask = build_mask(before, after, int(thresholds.get("pixel_channel_threshold", DEFAULT_PIXEL_CHANNEL_THRESHOLD)))
    changed_pixels = mask.histogram()[255]
    total_pixels = before.width * before.height
    changed_ratio = changed_pixels / total_pixels if total_pixels else 0
    if changed_pixels == 0 or changed_ratio < float(thresholds.get("noise_changed_area_ratio", DEFAULT_NOISE_CHANGED_AREA_RATIO)):
        return {"classification": "noise", "confidence": 1.0, "model_called": False}
    bbox = bbox_with_padding(
        mask.getbbox() or (0, 0, before.width, before.height),
        before.width, before.height, int(thresholds.get("crop_padding_px", DEFAULT_CROP_PADDING_PX)),
    )
    stitch(before, after, bbox, crop_path)
    return {"classification": context.AGENT_TRIAGE_CLASSIFICATION, "confidence": 0.0, "model_called": False}


def make_fixture_pair(root: Path, name: str, kind: str) -> tuple[Path, Path]:
    before = Image.new("RGB", (320, 200), "white")
    after = Image.new("RGB", (320, 200), "white")
    draw_before = ImageDraw.Draw(before)
    draw_after = ImageDraw.Draw(after)
    draw_before.rectangle((40, 60, 280, 130), outline="black", width=2)
    draw_before.text((58, 85), "KubeStellar Console", fill="black")
    draw_after.rectangle((40, 60, 280, 130), outline="black", width=2)
    draw_after.text((58, 85), "KubeStellar Console", fill="black")
    if kind == "noise":
        draw_after.point((12, 12), fill=(230, 230, 230))
    elif kind == "regression":
        draw_after.rectangle((40, 60, 280, 130), fill="white", outline="black", width=2)
        draw_after.text((58, 120), "KubeStellar Console", fill="black")
        draw_after.rectangle((50, 85, 260, 105), fill="red")
    elif kind == "intentional":
        draw_after.rectangle((40, 60, 280, 130), fill=(235, 245, 255), outline="blue", width=2)
        draw_after.text((58, 85), "KubeStellar Console", fill="blue")
    before_path = root / f"{name}-expected.png"
    after_path = root / f"{name}-actual.png"
    before.save(before_path)
    after.save(after_path)
    return before_path, after_path
