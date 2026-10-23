import assert from 'node:assert/strict';

const { getAddTileTargetForLayout, getBoardPagesForLayout, getTilesForBoardLayout } =
  await import('../src/features/board/utils/boardOrdering.ts');
const { BOARD_GRID_SIZES, DEFAULT_BOARD_GRID_SIZE, findBoardGridSize, getBoardGridSizeById } =
  await import('../src/shared/constants/boardGrid.ts');

const makeTile = (id, position, labelCs, category) => ({
  id,
  boardId: 'board',
  position,
  labelCs,
  emoji: '•',
  visualType: 'emoji',
  category,
  speechMode: 'tts',
  updatedAt: '2026-01-01T00:00:00.000Z',
  revision: 1,
});

const tiles = [
  makeTile('tile-social-2', 0, 'Táta', 'social'),
  makeTile('tile-food-2', 1, 'Banán', 'food'),
  makeTile('tile-needs-2', 2, 'Ne', 'needs'),
  makeTile('tile-food-1', 3, 'Ananas', 'food'),
  makeTile('tile-needs-1', 4, 'Ano', 'needs'),
  makeTile('tile-social-1', 5, 'Máma', 'social'),
  makeTile('tile-activities-1', 6, 'Hrát', 'activities'),
];

const manual = getTilesForBoardLayout(tiles, 'manual', ['food', 'needs', 'social', 'activities', 'feelings']);
assert.deepEqual(
  manual.map((tile) => tile.id),
  tiles.map((tile) => tile.id)
);

const grouped = getTilesForBoardLayout(tiles, 'category', ['food', 'needs', 'social', 'activities', 'feelings']);
assert.deepEqual(grouped.map((tile) => tile.id), [
  'tile-food-1',
  'tile-food-2',
  'tile-needs-1',
  'tile-needs-2',
  'tile-social-1',
  'tile-social-2',
  'tile-activities-1',
]);

const dedupedOrder = getTilesForBoardLayout(tiles, 'category', ['social', 'social']);
assert.deepEqual(dedupedOrder.map((tile) => tile.id), [
  'tile-social-1',
  'tile-social-2',
  'tile-needs-1',
  'tile-needs-2',
  'tile-activities-1',
  'tile-food-1',
  'tile-food-2',
]);

const categoryPages = getBoardPagesForLayout(
  grouped,
  'category',
  ['food', 'needs', 'social', 'activities', 'feelings'],
  3,
  true
);
assert.deepEqual(
  categoryPages.map((page) => ({
    category: page.category,
    ids: page.tiles.map((tile) => tile.id),
  })),
  [
    { category: 'food', ids: ['tile-food-1', 'tile-food-2'] },
    { category: 'needs', ids: ['tile-needs-1', 'tile-needs-2'] },
    { category: 'social', ids: ['tile-social-1', 'tile-social-2'] },
    { category: 'activities', ids: ['tile-activities-1'] },
  ]
);

const continuousPages = getBoardPagesForLayout(
  grouped,
  'category',
  ['food', 'needs', 'social', 'activities', 'feelings'],
  3,
  false
);
assert.deepEqual(continuousPages.map((page) => page.category), [undefined, undefined, undefined]);
assert.deepEqual(continuousPages.map((page) => page.tiles.length), [3, 3, 1]);

const manualAddTarget = getAddTileTargetForLayout(tiles, categoryPages, 'manual', 1);
assert.equal(manualAddTarget?.anchorTile.id, 'tile-activities-1');
assert.equal(manualAddTarget?.category, undefined);

const categoryAddTarget = getAddTileTargetForLayout(tiles, categoryPages, 'category', 2);
assert.equal(categoryAddTarget?.anchorTile.id, 'tile-social-2');
assert.equal(categoryAddTarget?.category, 'social');

const continuousAddTarget = getAddTileTargetForLayout(tiles, continuousPages, 'category', 1);
assert.equal(continuousAddTarget?.anchorTile.id, 'tile-social-2');
assert.equal(continuousAddTarget?.category, 'social');

// Tile size presets: the board stores columns × rows, and changing them only moves page breaks.
assert.deepEqual(
  BOARD_GRID_SIZES.map((size) => [size.id, size.columns, size.rows]),
  [
    ['standard', 4, 4],
    ['large', 3, 4],
    ['largest', 3, 3],
  ]
);
assert.equal(findBoardGridSize(4, 4)?.id, 'standard');
assert.equal(findBoardGridSize(3, 4)?.id, 'large');
assert.equal(findBoardGridSize(5, 5), null);
assert.equal(getBoardGridSizeById('unknown'), DEFAULT_BOARD_GRID_SIZE);
{
  const manyTiles = Array.from({ length: 20 }, (_, index) =>
    makeTile(`t${index}`, index, `Dlaždice ${index}`, 'needs')
  );
  const pageIds = (pageSize) =>
    getBoardPagesForLayout(manyTiles, 'manual', ['needs'], pageSize, true).map((page) =>
      page.tiles.map((tile) => tile.id)
    );
  const standardPages = pageIds(16);
  const largestPages = pageIds(9);
  assert.equal(standardPages.length, 2);
  assert.equal(largestPages.length, 3);
  assert.deepEqual(largestPages.flat(), standardPages.flat());
  assert.deepEqual(largestPages[1], ['t9', 't10', 't11', 't12', 't13', 't14', 't15', 't16', 't17']);
}

console.log('board-ordering-ok');
