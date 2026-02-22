import json
import math
from pathlib import Path

from pyproj import Transformer


def point_in_ring(px: float, py: float, ring: list[tuple[float, float]]) -> bool:
    # Ray casting; ring expected closed or open (we handle both)
    if not ring:
        return False
    if ring[0] != ring[-1]:
        ring = ring + [ring[0]]

    inside = False
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        intersects = ((y1 > py) != (y2 > py)) and (
            px < (x2 - x1) * (py - y1) / ((y2 - y1) or 1e-12) + x1
        )
        if intersects:
            inside = not inside
    return inside


def dist_point_seg(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay

    c1 = vx * wx + vy * wy
    if c1 <= 0:
        return math.hypot(px - ax, py - ay)

    c2 = vx * vx + vy * vy
    if c2 <= c1:
        return math.hypot(px - bx, py - by)

    t = c1 / c2
    projx, projy = ax + t * vx, ay + t * vy
    return math.hypot(px - projx, py - projy)


def min_distance_to_ring(px: float, py: float, ring: list[tuple[float, float]]) -> float:
    if not ring:
        return float("inf")
    if ring[0] != ring[-1]:
        ring = ring + [ring[0]]

    min_d = float("inf")
    for i in range(len(ring) - 1):
        ax, ay = ring[i]
        bx, by = ring[i + 1]
        d = dist_point_seg(px, py, ax, ay, bx, by)
        if d < min_d:
            min_d = d
    return min_d


def main() -> None:
    # From user's screenshot (ITM)
    plan = "425-1308469"
    point_x, point_y = 185888.80, 655607.81

    gvul_path = Path("data/mmg") / plan / "MVT_GVUL.geojson"
    if not gvul_path.exists():
        raise SystemExit(f"Missing {gvul_path}")

    geo = json.loads(gvul_path.read_text(encoding="utf-8"))
    if not geo.get("features"):
        raise SystemExit("GVUL GeoJSON has no features")

    geom = geo["features"][0]["geometry"]

    # convert polygon coords (WGS84) back to ITM so we can measure meters
    to_itm = Transformer.from_crs("EPSG:4326", "EPSG:2039", always_xy=True)

    def wgs_pair_to_itm(coord: list[float]) -> tuple[float, float]:
        lng, lat = coord
        x, y = to_itm.transform(lng, lat)
        return (x, y)

    if geom["type"] == "Polygon":
        rings = geom["coordinates"]
    elif geom["type"] == "MultiPolygon":
        # Take first polygon
        rings = geom["coordinates"][0]
    else:
        raise SystemExit(f"Unexpected geom type: {geom['type']}")

    outer_ring_itm = [wgs_pair_to_itm(c) for c in rings[0]]

    inside = point_in_ring(point_x, point_y, outer_ring_itm)
    min_d = min_distance_to_ring(point_x, point_y, outer_ring_itm)

    # also provide WGS84 point
    to_wgs = Transformer.from_crs("EPSG:2039", "EPSG:4326", always_xy=True)
    lng, lat = to_wgs.transform(point_x, point_y)

    print("Plan:", plan)
    print("Point ITM:", point_x, point_y)
    print("Point WGS84 lat,lng:", lat, lng)
    print("Inside GVUL (outer ring):", inside)
    print("Min distance to GVUL boundary (m):", round(min_d, 3))


if __name__ == "__main__":
    main()
