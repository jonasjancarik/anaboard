# Board Layout Modes

Last updated: 2026-10-23

Read when: changing tile ordering, category behavior, board paging, tile size, or settings sync.

## Modes

AnaBoard supports two board display modes per profile:

- `manual`: tiles render by stored `position`. This is the default and preserves motor memory.
- `category`: tiles render by caregiver-defined category order, then by Czech alphabetical `labelCs`.

Switching modes never rewrites tile `position`. Manual order remains available when the caregiver returns to `manual`.

## Tile Size

The board's grid (`columns_count` × `rows_count` on `boards`) sets how many tiles fit on a page. Caregivers pick one of the presets in `src/shared/constants/boardGrid.ts`:

| Preset | Grid | Tiles per page |
| --- | --- | --- |
| Běžné | 4 × 4 | 16 |
| Větší | 3 × 4 | 12 |
| Největší | 3 × 3 | 9 |

The size belongs to the board, not the device, so it syncs and every device shows the same pages. Changing it never rewrites tile `position`: tiles keep their order and only the page breaks move, so switching back restores the previous pages exactly. Settings save the choice right away and show a preview of the first page with the resulting page count.

The size is offered on the first setup screen (when a cloud profile is created) and in settings under appearance. Tile pictures and label text scale with the rendered tile size; on a 4 × 4 phone board they look the same as before.

A board synced from an older build or another tool may have a grid that is not a preset; settings then show it as "Vlastní" until the caregiver picks a preset.

## Category Pages

Grouped mode defaults to starting each category on a new logical page. Category pages show a small Czech category name above the tile grid. Caregivers can turn this off while keeping grouped alphabetical order, in which case categories flow continuously across pages.

When a caregiver adds a tile while grouped mode is active, the new tile uses the category of the current logical page. On continuous grouped pages, the category follows the tile at the insertion point.

## Category Order

`categoryOrder` is stored as the complete ordered list of known categories:

```json
["needs", "feelings", "social", "activities", "food"]
```

The app normalizes this list before use: duplicates are removed, unknown categories are ignored, and missing known categories are appended in the default order.

## Storage And Sync

Local SQLite stores the preference in `profile_settings`:

- `board_layout_mode`
- `category_order`
- `categories_start_new_page`

Supabase mirrors the same fields on `profile_settings`. Older remote schemas are tolerated by sync fallbacks, but new deployments should run the matching Supabase migration.
