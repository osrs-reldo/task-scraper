# New League Setup Guide

This covers the one-time manual setup required when a new league launches. Once done, ongoing cache updates are handled automatically by `league-update.yml`.

All CLI commands run from `task-scraper/` unless noted.

---

## 1. Generate the task-type entry

Run the interactive extractor. It will walk you through identifying params, filters, etc.:
```bash
npm run cli -- tasks extract-dbrow --enum-id <dbRowEnumId> --json
```

It writes:
- `./out/LEAGUE_7.json` — raw task list (can be discarded)
- `./out/league_7-tasktype.json` — task-type definition

Then merge it into task-types.json:
```bash
node ../task-updater-workflow/scripts/update-task-types.js ./out/league_7-tasktype.json ../task-json-store/task-types.json
```

Afterwards, manually set these fields in task-types.json that the extractor doesn't know:
- `taskSourceType`: `"DBROW"`
- `dbRowEnumId`: `<enum id>`
- `taskCompletedScriptId`: `<script id>` — see below
- `taskVarps`: `[]` ← will be populated in step 3
- `taskPointTiers`: points breakpoints per tier
- `wikiConfig`: URL, taskIdAttribute, completionColumnId, requirementsColumnId

Commit task-types.json.

### Finding dbRowEnumId

The source enum maps `sortId → dbRowId` for the task list. In the osrs-dumps scripts, find the task list draw script (equivalent to `[proc,script9428]` for LEAGUE_6):
- It will call `enum_getoutputs(dbrow, enum_XXXX)` — that's your enum ID.

Confirm by checking the enum size matches the expected task count.

### Finding taskCompletedScriptId

Trace: task list UI script → per-row display call → completion status call → the switch/testbit script that reads `%league_task_completed_N` varps. Use the script ID number from the comment at the top of that `.cs2` file.

Cross-check by grepping `varp.sym` for the varp names:
```bash
grep "league_task_completed" osrs-dumps/symbols/varp.sym
```

---

## 2. Set up mapped-data (manual, one-time)

`mapped-data/LEAGUE_7/` needs two committed files that can't be auto-derived.

### a. varbit-map.json — task varbit progress mapping

Run the interactive mapper:
```bash
npm run cli -- tasks map-varbit-progress --type LEAGUE_7
```
This writes to both `./out/LEAGUE_7-varbit-map.json` and `../task-json-store/mapped-data/LEAGUE_7/varbit-map.json`.

Commit the mapped-data file to task-json-store.

### b. locations.json — task map locations

> **Note:** This currently depends on [syrifgit/full-task-scraper](https://github.com/syrifgit/full-task-scraper) to extract map locations from the cache. Run that tool against the new league's cache to produce location data.

Format:
```json
[{ "dbRowId": 12345, "location": { "x": 3200, "y": 3400, "plane": 0 } }]
```

Write to `task-json-store/mapped-data/LEAGUE_7/locations.json` and commit.

---

## 3. Run update-varps to populate taskVarps

```bash
npm run cli -- tasks update-varps --type LEAGUE_7 --json
```

This analyzes the completion script and extracts all varp IDs into `./out/league_7-tasktype.json`. Then run the `update-task-types.js` script to write it back:
```bash
node scripts/update-task-types.js ./out/league_7-tasktype.json ../task-json-store/task-types.json
```

Commit task-types.json.

---

## 4. Run the full pipeline once manually to verify

```bash
npm run cli -- tasks generate --type LEAGUE_7 --json
npm run cli -- tasks update-wiki --type LEAGUE_7 --input ./out/LEAGUE_7.min.json --json
npm run cli -- tasks join-location --type LEAGUE_7 --input ./out/LEAGUE_7.min.json --locations ../task-json-store/mapped-data/LEAGUE_7/locations.json --json
npm run cli -- tasks map-boss-kc --type LEAGUE_7
npm run cli -- tasks apply-boss-kc --type LEAGUE_7 --input ./out/LEAGUE_7.min.json --json
npm run cli -- tasks apply-varbit-progress --type LEAGUE_7 --input ./out/LEAGUE_7.min.json --map ../task-json-store/mapped-data/LEAGUE_7/varbit-map.json --json
cp ./out/LEAGUE_7.min.json ../task-json-store/tasks/LEAGUE_7.min.json
```

Review the output, then commit `tasks/LEAGUE_7.min.json` to task-json-store.

---

## 5. Update league-update.yml default task type

In `task-updater-workflow/.github/workflows/league-update.yml`, update the `repository_dispatch` default so automated runs target the new league:

```yaml
- name: Set variables
  run: |
    echo "TASK_TYPE=${{ github.event.inputs.task_type || 'LEAGUE_7' }}" >> $GITHUB_ENV
```

After this, every new cache commit automatically runs the full pipeline for LEAGUE_7 and opens a PR.
