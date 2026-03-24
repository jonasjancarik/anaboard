import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TileVisual } from '../../../shared/components/TileVisual';
import { APP_THEME } from '../../../shared/constants/theme';
import type { PhraseTokenSnapshot } from '../../../shared/types/domain';

export type PhraseBarItem = {
  id: string;
  kind: 'prediction' | 'saved' | 'recent';
  label: string;
  tokens: PhraseTokenSnapshot[];
};

type PhraseBarProps = {
  items: PhraseBarItem[];
  onPressItem: (item: PhraseBarItem) => void;
  onLongPressItem?: (item: PhraseBarItem) => void;
};

const KIND_STYLES: Record<
  PhraseBarItem['kind'],
  {
    backgroundColor: string;
    borderColor: string;
  }
> = {
  prediction: {
    backgroundColor: APP_THEME.accentSoft,
    borderColor: APP_THEME.accent,
  },
  saved: {
    backgroundColor: APP_THEME.warningSoft,
    borderColor: APP_THEME.warning,
  },
  recent: {
    backgroundColor: APP_THEME.surfaceAlt,
    borderColor: APP_THEME.borderStrong,
  },
};

export const PhraseBar = ({
  items,
  onPressItem,
  onLongPressItem,
}: PhraseBarProps) => {
  return (
    <View style={styles.wrap}>
      {items.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {items.map((item) => {
            const palette = KIND_STYLES[item.kind];

            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => onPressItem(item)}
                onLongPress={onLongPressItem ? () => onLongPressItem(item) : undefined}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: palette.backgroundColor,
                    borderColor: palette.borderColor,
                  },
                  pressed && styles.chipPressed,
                ]}
              >
                <View style={styles.sequenceWrap}>
                  {item.tokens.map((token, index) => (
                    <View
                      key={`${item.id}-${token.tileId}-${index}`}
                      style={index > 0 ? styles.sequenceItemAfter : undefined}
                    >
                      <TileVisual
                        emoji={token.emoji}
                        visualType={token.visualType}
                        imageLocalUri={token.imageLocalUri}
                        imageRemotePath={token.imageRemotePath}
                        size={22}
                        cornerRadius={8}
                      />
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    minHeight: 52,
  },
  content: {
    gap: 10,
    paddingHorizontal: 2,
  },
  chip: {
    minWidth: 50,
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  chipPressed: {
    transform: [{ scale: 0.98 }],
  },
  sequenceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sequenceItemAfter: {
    marginLeft: 4,
  },
});
