# Vendored from `../turtle_body` — do not edit by hand

These files are copied in by `generator/sync_from_turtle_body.py`. They are the
machine-readable form of the upstream geometry contract (see the repo root
`CLAUDE.md` → "Turtle Generator" and `turtle_body`'s `CLAUDE.md` §19).

| File | Source in turtle_body | What it is |
|---|---|---|
| `params.json` | `build/params.json` (from `build/export_params.py`, run by `build/build.py`) | every `lib/params.scad` `p_*()` value + the version string |
| `scad/*.scad` | `v1.0 SCADs/*.scad` | the four self-contained wooden-component bundles |
| `VERSION` | — | `turtle_body <version>`, stamped by the sync script |

## Updating after a turtle_body release

```bash
# in ../turtle_body:  git pull && python3 build/build.py
python3 generator/sync_from_turtle_body.py     # refresh this directory
python3 generator/check_params_sync.py         # fail if a generator default drifted
git diff generator/turtle_body/                # review the contract change
```

`check_params_sync.py` only checks the **input** layer (shared dimensions). The
formulas in each generator's `derive_dimensions()` still need a human eye against
the matching `scad/` bundle — see `generator/SYNC_PLAN.md`.
