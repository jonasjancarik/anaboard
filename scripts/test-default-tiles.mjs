import assert from 'node:assert/strict';

const {
  DEFAULT_TILES,
  DEFAULT_TILE_ROWS_EN,
  DEFAULT_TILE_ROWS_CS_FEMININE,
  DEFAULT_TILE_ROWS_CS_MASCULINE,
} = await import('../src/shared/constants/defaults.ts');

assert.equal(DEFAULT_TILE_ROWS_CS_MASCULINE.length, DEFAULT_TILE_ROWS_CS_FEMININE.length);
assert.equal(DEFAULT_TILE_ROWS_EN.length, DEFAULT_TILE_ROWS_CS_MASCULINE.length);

const masculineTiles = DEFAULT_TILES('2026-05-16T00:00:00.000Z', {
  locale: 'cs-CZ',
  childGender: 'masculine',
});
const feminineTiles = DEFAULT_TILES('2026-05-16T00:00:00.000Z', {
  locale: 'cs-CZ',
  childGender: 'feminine',
});
const englishTiles = DEFAULT_TILES('2026-05-16T00:00:00.000Z', {
  locale: 'en-US',
  childGender: 'masculine',
});
const englishFeminineTiles = DEFAULT_TILES('2026-05-16T00:00:00.000Z', {
  locale: 'en-US',
  childGender: 'feminine',
});

assert.equal(masculineTiles.length, 48);
assert.equal(feminineTiles.length, 48);
assert.equal(englishTiles.length, 48);
assert.equal(englishFeminineTiles.length, 48);
assert.deepEqual(
  masculineTiles.map((tile) => tile.id),
  feminineTiles.map((tile) => tile.id)
);
assert.deepEqual(
  masculineTiles.map((tile) => tile.position),
  feminineTiles.map((tile) => tile.position)
);
assert.equal(masculineTiles[3].labelCs, 'Hotový');
assert.equal(feminineTiles[3].labelCs, 'Hotová');
assert.equal(masculineTiles[19].labelCs, 'Spát');
assert.equal(feminineTiles[19].labelCs, 'Spát');
assert.equal(masculineTiles[20].labelCs, 'Veselý');
assert.equal(feminineTiles[20].labelCs, 'Veselá');
assert.equal(masculineTiles[21].labelCs, 'Smutný');
assert.equal(feminineTiles[21].labelCs, 'Smutná');
assert.equal(englishTiles[3].labelCs, 'Done');
assert.equal(englishTiles[5].labelCs, 'Not');
assert.equal(englishTiles[20].labelCs, 'Happy');
assert.equal(englishTiles[23].labelCs, 'Unsure');
assert.equal(masculineTiles[10].labelCs, 'Hrát');
assert.equal(masculineTiles[10].category, 'activities');
assert.equal(masculineTiles[16].labelCs, 'Ahoj');
assert.equal(masculineTiles[16].category, 'social');
assert.equal(masculineTiles[33].labelCs, 'Prosím');
assert.equal(masculineTiles[33].category, 'social');
assert.equal(masculineTiles[39].labelCs, 'Hračka');
assert.equal(masculineTiles[39].category, 'activities');
assert.equal(englishTiles[33].labelCs, 'Please');
assert.equal(englishTiles[39].labelCs, 'Toy');
assert.deepEqual(
  englishTiles.map((tile) => tile.labelCs),
  englishFeminineTiles.map((tile) => tile.labelCs)
);

console.log('default-tiles-ok');
