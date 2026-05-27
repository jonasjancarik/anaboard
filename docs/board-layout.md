# Board Layout Modes

Last updated: 2026-05-23

Read when: changing tile ordering, category behavior, board paging, or settings sync.

## Modes

AnaBoard supports two board display modes per profile:

- `manual`: tiles render by stored `position`. This is the default and preserves motor memory.
- `category`: tiles render by caregiver-defined category order, then by Czech alphabetical `labelCs`.

Switching modes never rewrites tile `position`. Manual order remains available when the caregiver returns to `manual`.

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
