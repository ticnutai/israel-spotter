from pathlib import Path
plans = Path("kfar_chabad_data/plans")
permits = Path("kfar_chabad_data/permits")
for label, root in [("PLANS", plans), ("PERMITS", permits)]:
    if not root.exists():
        continue
    print(f"\n=== {label} ===")
    for f in sorted(root.rglob("*")):
        if f.is_file() and f.suffix.lower() in (".jpg", ".jpeg", ".png", ".pdf", ".dwfx"):
            rel = f.relative_to(root)
            parts = list(rel.parts)
            print(f"  {' / '.join(parts)}")
