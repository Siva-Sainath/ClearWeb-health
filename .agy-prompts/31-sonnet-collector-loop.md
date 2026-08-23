# Task: Collector create-run-verify loop script

**Repo:** `/Users/siva/Documents/scrapeverse_project/scraper`

Create `scraper/scripts/collector_loop.py` that implements the hackathon loop:

```
for each pending collector_job:
  1. bdata scraper run <c_id> <url> --sync --sync-timeout 50
  2. validate_preview(output) 
  3. if fail → heal_collector(auto_approve=True) → approve if awaiting
  4. re-run → validate
  5. on success → update_collector_job status=verified, append targets.yaml
```

Reuse: `collectors/brightdata.py`, `pipeline/heal.py`, `sweep_collector_jobs.py` logic.

CLI:
```bash
python scripts/collector_loop.py --max 3
```

Wire `if __name__` and test with ONE collector from DB if any pending.

Do NOT modify unrelated files. `py_compile` all touched files.

Acceptance: script exists, compiles, dry-run lists pending jobs.
