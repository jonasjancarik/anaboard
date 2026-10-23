import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  BOARD_GRID_SIZES,
  findBoardGridSize,
  getBoardGridSizeById,
} from '../../../shared/constants/boardGrid';
import { APP_THEME } from '../../../shared/constants/theme';
import type { LocaleCopy } from '../../../shared/i18n/appCopy.types';
import type { BoardLayoutMode, Category, Tile } from '../../../shared/types/domain';
import {
  getBoardPagesForLayout,
  getTilesForBoardLayout,
} from '../../board/utils/boardOrdering';
import { SettingChoiceStepper, type SettingChoiceOption } from './SettingChoiceStepper';

const PREVIEW_WIDTH = 176;
const PREVIEW_GAP = 4;
const CUSTOM_VALUE = 'custom';

type TileSizeControlProps = {
  copy: LocaleCopy['settings'];
  columns: number;
  rows: number;
  tiles: Tile[];
  layoutMode: BoardLayoutMode;
  categoryOrder: Category[];
  categoriesStartNewPage: boolean;
  locale: string;
  previousLabel: string;
  nextLabel: string;
  onChange: (columns: number, rows: number) => Promise<void>;
};

export const TileSizeControl = ({
  copy,
  columns,
  rows,
  tiles,
  layoutMode,
  categoryOrder,
  categoriesStartNewPage,
  locale,
  previousLabel,
  nextLabel,
  onChange,
}: TileSizeControlProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const currentSize = findBoardGridSize(columns, rows);

  const options: SettingChoiceOption[] = [
    ...BOARD_GRID_SIZES.map((size) => ({
      value: size.id,
      label: copy.tileSizeLabels[size.id],
      detail: copy.tileSizeDetail(size.columns, size.rows),
    })),
    // A board synced from elsewhere may use a size that is not one of the presets.
    ...(currentSize
      ? []
      : [{ value: CUSTOM_VALUE, label: copy.tileSizeCustom, detail: copy.tileSizeDetail(columns, rows) }]),
  ];

  const pages = useMemo(() => {
    const orderedTiles = getTilesForBoardLayout(tiles, layoutMode, categoryOrder, locale);
    return getBoardPagesForLayout(
      orderedTiles,
      layoutMode,
      categoryOrder,
      columns * rows,
      categoriesStartNewPage
    );
  }, [categoriesStartNewPage, categoryOrder, columns, layoutMode, locale, rows, tiles]);

  const previewTiles = pages[0]?.tiles ?? [];
  const cellSize = (PREVIEW_WIDTH - PREVIEW_GAP * (columns - 1)) / columns;

  return (
    <View style={styles.container}>
      <SettingChoiceStepper
        title={copy.tileSize}
        value={currentSize?.id ?? CUSTOM_VALUE}
        options={options}
        disabled={isSaving}
        previousLabel={previousLabel}
        nextLabel={nextLabel}
        onChange={(nextValue) => {
          if (nextValue === CUSTOM_VALUE) {
            return;
          }

          const nextSize = getBoardGridSizeById(nextValue);
          setIsSaving(true);
          void onChange(nextSize.columns, nextSize.rows).finally(() => setIsSaving(false));
        }}
      />

      <View style={styles.previewBlock}>
        <Text style={styles.previewTitle}>{copy.tileSizePreviewTitle}</Text>
        <View style={[styles.previewGrid, { width: PREVIEW_WIDTH }]}>
          {Array.from({ length: columns * rows }, (_, index) => {
            const tile = previewTiles[index];
            return (
              <View
                key={tile?.id ?? `empty-${index}`}
                style={[
                  styles.previewCell,
                  { width: cellSize, height: cellSize },
                  !tile && styles.previewCellEmpty,
                ]}
              >
                {tile ? (
                  <Text style={{ fontSize: Math.floor(cellSize * 0.5) }}>
                    {tile.visualType === 'image' ? '🖼️' : tile.emoji}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
        <Text style={styles.note}>{copy.tileSizeNote(pages.length)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  previewBlock: {
    alignItems: 'center',
    gap: 8,
  },
  previewTitle: {
    alignSelf: 'stretch',
    color: APP_THEME.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PREVIEW_GAP,
  },
  previewCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: APP_THEME.primarySoft,
  },
  previewCellEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: APP_THEME.border,
  },
  note: {
    alignSelf: 'stretch',
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
