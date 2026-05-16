import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { TileVisual } from "../../../shared/components/TileVisual";
import type { TileVisualType } from "../../../shared/types/domain";
import { styles } from "../screens/EditorScreen.styles";

type TileAppearanceSectionProps = {
  labelCs: string;
  onLabelChange: (value: string) => void;
  previewEmoji: string;
  previewVisualType: TileVisualType;
  imageLocalUri?: string | null;
  imageRemotePath?: string | null;
  highContrast: boolean;
  previewBackgroundColor: string;
  onEditVisual: () => void;
  labelPlaceholder?: string;
};

export const TileAppearanceSection = ({
  labelCs,
  onLabelChange,
  previewEmoji,
  previewVisualType,
  imageLocalUri,
  imageRemotePath,
  highContrast,
  previewBackgroundColor,
  onEditVisual,
  labelPlaceholder = "Text",
}: TileAppearanceSectionProps) => {
  const [isLabelFocused, setIsLabelFocused] = useState(false);

  return (
    <>
      <View style={styles.tilePreviewWrap}>
        <View
          style={[
            styles.tilePreview,
            highContrast
              ? styles.tilePreviewHighContrast
              : {
                  backgroundColor: previewBackgroundColor,
                  borderColor: "transparent",
                },
          ]}
        >
          <Pressable onPress={onEditVisual} style={styles.tilePreviewIconButton}>
            <TileVisual
              emoji={previewEmoji}
              visualType={previewVisualType}
              imageLocalUri={imageLocalUri}
              imageRemotePath={imageRemotePath}
              size={72}
            />
            <View style={styles.tilePreviewBadge}>
              <Text style={styles.tilePreviewBadgeText}>✎</Text>
            </View>
          </Pressable>

          <View style={styles.tilePreviewLabelField}>
            {!labelCs && !isLabelFocused ? (
              <Text pointerEvents="none" style={styles.tilePreviewLabelPlaceholder}>
                {labelPlaceholder}
              </Text>
            ) : null}
            <TextInput
              value={labelCs}
              onChangeText={onLabelChange}
              style={styles.tilePreviewLabelInput}
              autoFocus
              onFocus={() => setIsLabelFocused(true)}
              onBlur={() => setIsLabelFocused(false)}
            />
          </View>
        </View>
      </View>
    </>
  );
};
