# AGENTS.md

## Design Rules

- Audience: kids + caregivers. Feel warm, calm, clear. Child-friendly; not toy-like.
- Tone: colorful content; restrained chrome. Strongest color belongs on tiles, not scaffolding.
- Layout: prefer clean canvas over nested cards. Avoid invisible frames around the board.
- Board paging: full-width pager. Tiles may have horizontal inset, but page transitions should disappear at the screen edge.
- Board grid: centered unless task explicitly needs another alignment. Outer spacing should match global screen padding.
- Tiles: soft fills, minimal or no borders in normal mode, readable shadow only. High-contrast mode may reintroduce stronger outlines.
- Tile labels: deterministic sizing. No auto-fit jitter. Favor 1-2 readable lines over tiny text.
- Bottom controls: respect safe areas on iPhone and Android. Lock/settings buttons must stay clear of curved corners and gesture areas.
- Pagination: simple. Prev + dots + next. No redundant counters unless clearly needed.
- Settings: compact, low-jargon, Czech-first. Prefer labels like `Rychlost hlasu` / `Tón hlasu` over raw TTS terms.
- Settings interactions: prefer direct controls or guided steppers over raw numeric inputs. Avoid giant save sections when per-control save is viable.
- Sensitive actions: move advanced or security tasks to focused secondary screens. Example: PIN change on its own screen.
- Copy: short, plain Czech. Avoid technical English unless unavoidable.
- Destructive actions: quiet by default; emphasize only when needed. Archive/restore should feel safer than reset/delete.

## When Editing UI

- Preserve current visual direction unless user asks for a redesign.
- Check spacing against screenshots, especially board edges, bottom bar, and long Czech words.
- Verify both child flow and caregiver flow when touching shared tokens or spacing.
