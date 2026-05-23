import assert from 'node:assert/strict';

const { getBoardPagesForLayout, getTilesForBoardLayout } =
  await import('../src/features/board/utils/boardOrdering.ts');

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

console.log('board-ordering-ok');
