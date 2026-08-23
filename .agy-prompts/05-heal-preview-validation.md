# Task: Heal preview validation unit check (no Bright Data credits)

**Repo:** `/Users/siva/Documents/scrapeverse_project`
**Scope:** `scraper/pipeline/heal.py` and `scraper/demo_heal.py` only.

## Context
Hackathon Act 2 requires strict preview gate:
- Empty `[]` preview → rejected (not auto-approved)
- Valid MRF/file URLs in preview → approved path

Functions in `scraper/pipeline/heal.py`:
- `validate_preview(preview_result)`
- `process_heal_approval()` (needs network — do NOT call)

## Steps
1. `python3 -m py_compile scraper/pipeline/heal.py scraper/demo_heal.py`
2. Run inline Python test (no BD API):
```python
import sys
sys.path.insert(0, "scraper")
from pipeline.heal import validate_preview

assert validate_preview([])[0] is False, "empty preview must fail"
assert validate_preview([{"pricing_files": [{"file_url": "https://example.com/charges.json"}]}])[0] is True
print("validate_preview OK")
```
3. If `validate_preview` logic is wrong, fix ONLY `heal.py` with minimal diff
4. Read `demo_heal.py` docstring — confirm it imports `reverify`, `log_heal_event`, `heal_collector` (no import errors on compile)

## Acceptance
Reply `PASS` or `FAIL` + one line summary of any fix.
