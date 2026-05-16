import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  CATEGORY_COLORS,
} from '../../../shared/constants/defaults';
import { getAppCopy } from '../../../shared/i18n/appCopy';
import { APP_THEME } from '../../../shared/constants/theme';
import { appHaptics } from '../../../shared/feedback/haptics';
import type { Category } from '../../../shared/types/domain';
import { normalizeCategoryOrder } from '../../../shared/utils/categoryOrder';

type CategoryOrderControlProps = {
  value: Category[];
  onChange: (value: Category[]) => void;
  disabled?: boolean;
  locale?: unknown;
};

const moveCategory = (categories: Category[], fromIndex: number, toIndex: number): Category[] => {
  const next = [...categories];
  const [category] = next.splice(fromIndex, 1);
  if (!category) {
    return categories;
  }

  next.splice(toIndex, 0, category);
  return next;
};

export const CategoryOrderControl = ({
  value,
  onChange,
  disabled = false,
  locale,
}: CategoryOrderControlProps) => {
  const categories = normalizeCategoryOrder(value);
  const copy = getAppCopy(locale);

  return (
    <View style={[styles.block, disabled && styles.blockDisabled]}>
      <Text style={styles.title}>{copy.categoryOrder.title}</Text>
      <View style={styles.rows}>
        {categories.map((category, index) => {
          const canMoveUp = !disabled && index > 0;
          const canMoveDown = !disabled && index < categories.length - 1;
          const colors = CATEGORY_COLORS[category];

          return (
            <View key={category} style={styles.row}>
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              />
              <Text style={styles.label}>{copy.categories[category]}</Text>
              <View style={styles.buttons}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.categoryOrder.moveUp(copy.categories[category])}
                  disabled={!canMoveUp}
                  onPress={() => {
                    if (!canMoveUp) {
                      return;
                    }

                    void appHaptics.selection();
                    onChange(moveCategory(categories, index, index - 1));
                  }}
                  style={({ pressed }) => [
                    styles.orderButton,
                    !canMoveUp && styles.orderButtonDisabled,
                    pressed && canMoveUp && styles.orderButtonPressed,
                  ]}
                >
                  <Text style={styles.orderButtonText}>↑</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.categoryOrder.moveDown(copy.categories[category])}
                  disabled={!canMoveDown}
                  onPress={() => {
                    if (!canMoveDown) {
                      return;
                    }

                    void appHaptics.selection();
                    onChange(moveCategory(categories, index, index + 1));
                  }}
                  style={({ pressed }) => [
                    styles.orderButton,
                    !canMoveDown && styles.orderButtonDisabled,
                    pressed && canMoveDown && styles.orderButtonPressed,
                  ]}
                >
                  <Text style={styles.orderButtonText}>↓</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  block: {
    gap: 10,
  },
  blockDisabled: {
    opacity: 0.55,
  },
  title: {
    color: APP_THEME.text,
    fontSize: 16,
    fontWeight: '700',
  },
  rows: {
    gap: 8,
  },
  row: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surfaceTint,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 8,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
  },
  label: {
    flex: 1,
    color: APP_THEME.text,
    fontSize: 15,
    fontWeight: '800',
  },
  buttons: {
    flexDirection: 'row',
    gap: 6,
  },
  orderButton: {
    width: 36,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderButtonDisabled: {
    opacity: 0.35,
  },
  orderButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  orderButtonText: {
    color: APP_THEME.text,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '800',
  },
});
