# Preflop Ranges

Place your preflop range JSON files in this directory. The bot will load all `.json` files on startup.

## File Schema

Each JSON file defines one preflop scenario:

```json
{
  "scenario": "rfi",
  "position": "UTG",
  "vsPosition": null,
  "description": "UTG raise first in",
  "defaultAction": "fold",
  "ranges": {
    "AA":  { "raise": 1.0 },
    "AKs": { "raise": 1.0 },
    "AKo": { "raise": 0.85, "fold": 0.15 },
    "72o": { "fold": 1.0 }
  }
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `scenario` | string | One of: `rfi`, `vs_rfi`, `vs_3bet`, `vs_4bet`, `limp` |
| `position` | string | Acting player's position: `UTG`, `MP`, `CO`, `BTN`, `SB`, `BB` |
| `vsPosition` | string or null | Opponent's position (e.g., `"UTG"` for "BB facing UTG open"). `null` for RFI. |
| `description` | string | Human-readable description |
| `defaultAction` | string | Action for hands not listed in ranges (usually `"fold"`) |
| `ranges` | object | Map of canonical hand → action frequencies |

### Hand Format

Use canonical poker hand notation (169 unique combos):
- Pocket pairs: `AA`, `KK`, `QQ`, ..., `22`
- Suited: `AKs`, `AQs`, `T9s`, etc. (higher rank first)
- Offsuit: `AKo`, `AQo`, `T9o`, etc. (higher rank first)

### Action Frequencies

Each hand maps to an object of action probabilities that must sum to 1.0:

```json
{ "raise": 0.7, "call": 0.2, "fold": 0.1 }
```

Valid actions: `fold`, `call`, `raise`, `allIn`

### Scenarios

**RFI (Raise First In)** — Action folds to this player:
- `scenario: "rfi"`, one file per position (UTG, MP, CO, BTN, SB)

**vs RFI** — Facing a single open raise:
- `scenario: "vs_rfi"`, `vsPosition` = opener's position
- e.g., BB facing UTG open: `position: "BB"`, `vsPosition: "UTG"`

**vs 3-bet** — Original raiser facing a 3-bet:
- `scenario: "vs_3bet"`, `vsPosition` = 3-bettor's position

**vs 4-bet** — 3-bettor facing a 4-bet:
- `scenario: "vs_4bet"`, `vsPosition` = 4-bettor's position

**Limp** — Limped pot scenarios:
- `scenario: "limp"`

### File Naming

Name files descriptively. Examples:
- `rfi_utg.json`
- `rfi_btn.json`
- `vs_rfi_bb_vs_utg.json`
- `vs_3bet_utg_vs_bb.json`
