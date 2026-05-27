import type { BoardLayoutMode, Category, Tile } from '../../../shared/types/domain';

export type OrderedBoardPage = {
  pageIndex: number;
  tiles: Tile[];
  category?: Category;
};

export type AddTileTarget = {
  anchorTile: Tile;
  category?: Category;
};

const DEFAULT_CATEGORY_ORDER: Category[] = ['needs', 'feelings', 'social', 'activities', 'food'];
const CATEGORY_SET = new Set<string>(DEFAULT_CATEGORY_ORDER);

const createCollator = (locale: unknown): Intl.Collator =>
  new Intl.Collator(locale === 'en-US' ? 'en-US' : 'cs-CZ', {
    numeric: true,
    sensitivity: 'base',
  });

const buildCategoryRank = (categoryOrder: Category[]): Record<Category, number> => {
  return categoryOrder.reduce<Record<Category, number>>((rank, category, index) => {
    rank[category] = index;
    return rank;
  }, {} as Record<Category, number>);
};

const normalizeBoardCategoryOrder = (categoryOrder: Category[]): Category[] => {
  const seen = new Set<Category>();
  const normalized: Category[] = [];

  for (const category of categoryOrder) {
    if (!CATEGORY_SET.has(category) || seen.has(category)) {
      continue;
    }

    seen.add(category);
    normalized.push(category);
  }

  for (const category of DEFAULT_CATEGORY_ORDER) {
    if (!seen.has(category)) {
      normalized.push(category);
    }
  }

  return normalized;
};

export const getTilesForBoardLayout = (
  tiles: Tile[],
  layoutMode: BoardLayoutMode,
  categoryOrder: Category[],
  locale?: unknown
): Tile[] => {
  if (layoutMode === 'manual') {
    return tiles;
  }

  const normalizedCategoryOrder = normalizeBoardCategoryOrder(categoryOrder);
  const categoryRank = buildCategoryRank(normalizedCategoryOrder);
  const fallbackRank = DEFAULT_CATEGORY_ORDER.length;
  const collator = createCollator(locale);

  return [...tiles].sort((left, right) => {
    const categoryDelta =
      (categoryRank[left.category] ?? fallbackRank) -
      (categoryRank[right.category] ?? fallbackRank);
    if (categoryDelta !== 0) {
      return categoryDelta;
    }

    const labelDelta = collator.compare(left.labelCs.trim(), right.labelCs.trim());
    if (labelDelta !== 0) {
      return labelDelta;
    }

    const positionDelta = left.position - right.position;
    if (positionDelta !== 0) {
      return positionDelta;
    }

    return left.id.localeCompare(right.id);
  });
};

const pushPages = (
  pages: OrderedBoardPage[],
  tiles: Tile[],
  pageSize: number,
  category?: Category
) => {
  const pageCount = Math.max(1, Math.ceil(tiles.length / pageSize));

  for (let index = 0; index < pageCount; index += 1) {
    pages.push({
      pageIndex: pages.length,
      tiles: tiles.slice(index * pageSize, index * pageSize + pageSize),
      category,
    });
  }
};

export const getBoardPagesForLayout = (
  orderedTiles: Tile[],
  layoutMode: BoardLayoutMode,
  categoryOrder: Category[],
  pageSize: number,
  categoriesStartNewPage: boolean
): OrderedBoardPage[] => {
  const normalizedPageSize = Math.max(1, pageSize);
  const pages: OrderedBoardPage[] = [];

  if (layoutMode !== 'category' || !categoriesStartNewPage) {
    pushPages(pages, orderedTiles, normalizedPageSize);
    return pages;
  }

  const normalizedCategoryOrder = normalizeBoardCategoryOrder(categoryOrder);
  for (const category of normalizedCategoryOrder) {
    const categoryTiles = orderedTiles.filter((tile) => tile.category === category);
    if (categoryTiles.length === 0) {
      continue;
    }

    pushPages(pages, categoryTiles, normalizedPageSize, category);
  }

  if (pages.length === 0) {
    pushPages(pages, [], normalizedPageSize);
  }

  return pages;
};

export const getAddTileTargetForLayout = (
  tiles: Tile[],
  pages: OrderedBoardPage[],
  layoutMode: BoardLayoutMode,
  pageIndex: number
): AddTileTarget | null => {
  const fallbackAnchorTile = tiles[tiles.length - 1];
  if (!fallbackAnchorTile) {
    return null;
  }

  if (layoutMode !== 'category') {
    return {
      anchorTile: fallbackAnchorTile,
    };
  }

  const normalizedPageIndex = Math.max(0, Math.min(pages.length - 1, pageIndex));
  const page = pages[normalizedPageIndex];
  const pageTiles = page?.tiles ?? [];
  const anchorTile = pageTiles[pageTiles.length - 1] ?? fallbackAnchorTile;
  const category = page?.category ?? pageTiles[pageTiles.length - 1]?.category;

  return {
    anchorTile,
    category,
  };
};
