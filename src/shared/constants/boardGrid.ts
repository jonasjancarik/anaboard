export type BoardGridSizeId = 'standard' | 'large' | 'largest';

export type BoardGridSize = {
  id: BoardGridSizeId;
  columns: number;
  rows: number;
};

/**
 * Tile sizes a caregiver can pick. The size is stored on the board (columns × rows) and synced,
 * so every device shows the same pages. Changing it keeps tile order and only moves page breaks.
 */
export const BOARD_GRID_SIZES: BoardGridSize[] = [
  { id: 'standard', columns: 4, rows: 4 },
  { id: 'large', columns: 3, rows: 4 },
  { id: 'largest', columns: 3, rows: 3 },
];

export const DEFAULT_BOARD_GRID_SIZE = BOARD_GRID_SIZES[0];

export const findBoardGridSize = (columns: number, rows: number): BoardGridSize | null => {
  return BOARD_GRID_SIZES.find((size) => size.columns === columns && size.rows === rows) ?? null;
};

export const getBoardGridSizeById = (id: string): BoardGridSize => {
  return BOARD_GRID_SIZES.find((size) => size.id === id) ?? DEFAULT_BOARD_GRID_SIZE;
};
