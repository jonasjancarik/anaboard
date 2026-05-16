import { DEFAULT_BOARD_LAYOUT_MODE, DEFAULT_CATEGORY_ORDER } from '../constants/defaults';
import type { BoardLayoutMode, Category } from '../types/domain';

const CATEGORY_SET = new Set<string>(DEFAULT_CATEGORY_ORDER);

export const normalizeBoardLayoutMode = (value: unknown): BoardLayoutMode => {
  return value === 'category' || value === 'manual'
    ? value
    : DEFAULT_BOARD_LAYOUT_MODE;
};

export const normalizeCategoryOrder = (value: unknown): Category[] => {
  let rawOrder: unknown[] = [];

  if (Array.isArray(value)) {
    rawOrder = value;
  } else if (typeof value === 'string' && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value) as unknown;
      rawOrder = Array.isArray(parsed) ? parsed : value.split(',');
    } catch {
      rawOrder = value.split(',');
    }
  }

  const seen = new Set<Category>();
  const order: Category[] = [];

  for (const item of rawOrder) {
    if (typeof item !== 'string') {
      continue;
    }

    const category = item.trim();
    if (!CATEGORY_SET.has(category) || seen.has(category as Category)) {
      continue;
    }

    seen.add(category as Category);
    order.push(category as Category);
  }

  for (const category of DEFAULT_CATEGORY_ORDER) {
    if (!seen.has(category)) {
      order.push(category);
    }
  }

  return order;
};

export const serializeCategoryOrder = (value: unknown): string => {
  return JSON.stringify(normalizeCategoryOrder(value));
};
