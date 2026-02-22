import json
p = json.load(open('upload_progress.json','r',encoding='utf-8'))
uploaded = p.get('uploaded',{})
failed = p.get('failed',{})
print(f"Uploaded: {len(uploaded)}")
print(f"Failed: {len(failed)}")
if failed:
    # Group by error type
    errs = {}
    for k,v in failed.items():
        e = v.get('error','unknown')[:80]
        if e not in errs:
            errs[e] = []
        errs[e].append(k)
    for e, files in sorted(errs.items(), key=lambda x: -len(x[1])):
        print(f"\n  [{len(files)}x] {e}")
        for f in files[:3]:
            print(f"    - {f}")
