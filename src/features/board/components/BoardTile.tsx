import { memo, useCallback } from 'react';
import {
  Animated,
  Pressable,
  Text,
  type GestureResponderEvent,
} from 'react-native';

import { CATEGORY_COLORS } from '../../../shared/constants/defaults';
import { TileVisual } from '../../../shared/components/TileVisual';
import { appHaptics } from '../../../shared/feedback/haptics';
import type { Tile } from '../../../shared/types/domain';
import { styles } from '../screens/BoardScreen.styles';

const FITTED_TILE_LABEL_PROPS = {
  allowFontScaling: false,
  numberOfLines: 2 as const,
};

type TileLabelStyle = {
  fontSize: number;
  lineHeight: number;
};

type BoardTileProps = {
  tile: Tile;
  tileSize: number;
  tileVisualSize: number;
  showLabels: boolean;
  highContrast: boolean;
  isDraggedTile: boolean;
  flashVisible: boolean;
  newTileFlashValue: Animated.Value;
  labelStyle: TileLabelStyle;
  caregiverUnlocked: boolean;
  longPressDelayMs: number;
  globalIndex: number;
  onTilePress: (tileId: string) => void;
  onBeginReorderTouch: (
    tileId: string,
    startIndex: number,
    pageX: number,
    pageY: number
  ) => void;
  onEndReorderTouch: () => void;
};

const BoardTileComponent = ({
  tile,
  tileSize,
  tileVisualSize,
  showLabels,
  highContrast,
  isDraggedTile,
  flashVisible,
  newTileFlashValue,
  labelStyle,
  caregiverUnlocked,
  longPressDelayMs,
  globalIndex,
  onTilePress,
  onBeginReorderTouch,
  onEndReorderTouch,
}: BoardTileProps) => {
  const colors = CATEGORY_COLORS[tile.category];

  const handlePress = useCallback(() => {
    onTilePress(tile.id);
  }, [onTilePress, tile.id]);

  const handleLongPress = useCallback(
    (event: GestureResponderEvent) => {
      void appHaptics.longPress();
      onBeginReorderTouch(
        tile.id,
        globalIndex,
        event.nativeEvent.pageX,
        event.nativeEvent.pageY
      );
    },
    [globalIndex, onBeginReorderTouch, tile.id]
  );

  const handleTouchEnd = useCallback(() => {
    onEndReorderTouch();
  }, [onEndReorderTouch]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={caregiverUnlocked ? `Upravit ${tile.labelCs}` : `Řekni ${tile.labelCs}`}
      onPress={handlePress}
      onLongPress={caregiverUnlocked ? handleLongPress : undefined}
      delayLongPress={caregiverUnlocked ? longPressDelayMs : undefined}
      onTouchEnd={caregiverUnlocked ? handleTouchEnd : undefined}
      onTouchCancel={caregiverUnlocked ? handleTouchEnd : undefined}
      style={({ pressed }) => [
        styles.tile,
        highContrast && styles.tileHighContrast,
        {
          width: tileSize,
          height: tileSize,
          backgroundColor: highContrast ? '#FFFFFF' : colors.background,
          borderColor: highContrast ? '#111827' : 'transparent',
        },
        isDraggedTile && styles.tilePlaceholder,
        pressed && styles.tilePressed,
      ]}
    >
      {flashVisible ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.newTileFlashOverlay,
            {
              opacity: newTileFlashValue,
            },
          ]}
        />
      ) : null}
      <TileVisual
        emoji={tile.emoji}
        visualType={tile.visualType}
        imageLocalUri={tile.imageLocalUri}
        imageRemotePath={tile.imageRemotePath}
        size={tileVisualSize}
      />
      {showLabels ? (
        <Text style={[styles.tileLabel, labelStyle]} {...FITTED_TILE_LABEL_PROPS}>
          {tile.labelCs}
        </Text>
      ) : null}
    </Pressable>
  );
};

const areTileVisualPropsEqual = (previous: Tile, next: Tile) =>
  previous.id === next.id &&
  previous.labelCs === next.labelCs &&
  previous.emoji === next.emoji &&
  previous.visualType === next.visualType &&
  previous.imageLocalUri === next.imageLocalUri &&
  previous.imageRemotePath === next.imageRemotePath &&
  previous.category === next.category;

export const BoardTile = memo(BoardTileComponent, (previous, next) => {
  return (
    areTileVisualPropsEqual(previous.tile, next.tile) &&
    previous.tileSize === next.tileSize &&
    previous.tileVisualSize === next.tileVisualSize &&
    previous.showLabels === next.showLabels &&
    previous.highContrast === next.highContrast &&
    previous.isDraggedTile === next.isDraggedTile &&
    previous.flashVisible === next.flashVisible &&
    previous.newTileFlashValue === next.newTileFlashValue &&
    previous.labelStyle.fontSize === next.labelStyle.fontSize &&
    previous.labelStyle.lineHeight === next.labelStyle.lineHeight &&
    previous.caregiverUnlocked === next.caregiverUnlocked &&
    previous.longPressDelayMs === next.longPressDelayMs &&
    previous.globalIndex === next.globalIndex &&
    previous.onTilePress === next.onTilePress &&
    previous.onBeginReorderTouch === next.onBeginReorderTouch &&
    previous.onEndReorderTouch === next.onEndReorderTouch
  );
});
