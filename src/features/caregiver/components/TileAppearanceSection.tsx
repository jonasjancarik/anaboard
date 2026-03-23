import { Pressable, Text, TextInput, View } from "react-native";

import { TileVisual } from "../../../shared/components/TileVisual";
import type { TileVisualType } from "../../../shared/types/domain";
import { styles } from "../screens/EditorScreen.styles";

type TileAppearanceSectionProps = {
  labelCs: string;
  onLabelChange: (value: string) => void;
  emoji: string;
  onEmojiChange: (value: string) => void;
  isEmojiKeyboardVisible: boolean;
  previewLabel: string;
  previewEmoji: string;
  previewVisualType: TileVisualType;
  visualType: TileVisualType;
  imageLocalUri?: string | null;
  imageRemotePath?: string | null;
  hasPreviewImage: boolean;
  showLabels: boolean;
  highContrast: boolean;
  previewBackgroundColor: string;
  onOpenEmojiPicker: () => void;
  onToggleEmojiKeyboard: () => void;
  onVisualTypeChange: (value: TileVisualType) => void;
  onPickImageFromLibrary: () => void;
  onTakePhoto: () => void;
  onRemoveImage: () => void;
};

export const TileAppearanceSection = ({
  labelCs,
  onLabelChange,
  emoji,
  onEmojiChange,
  isEmojiKeyboardVisible,
  previewLabel,
  previewEmoji,
  previewVisualType,
  visualType,
  imageLocalUri,
  imageRemotePath,
  hasPreviewImage,
  showLabels,
  highContrast,
  previewBackgroundColor,
  onOpenEmojiPicker,
  onToggleEmojiKeyboard,
  onVisualTypeChange,
  onPickImageFromLibrary,
  onTakePhoto,
  onRemoveImage,
}: TileAppearanceSectionProps) => {
  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Vybraná dlaždice</Text>
      </View>

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
          <TileVisual
            emoji={previewEmoji}
            visualType={previewVisualType}
            imageLocalUri={imageLocalUri}
            imageRemotePath={imageRemotePath}
            size={72}
          />
          {showLabels ? (
            <Text style={styles.tilePreviewLabel}>{previewLabel}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.fieldBlock}>
        <Text style={styles.inputLabel}>Text</Text>
        <TextInput
          value={labelCs}
          onChangeText={onLabelChange}
          style={styles.input}
        />
      </View>

      <View style={styles.divider} />

      <Text style={styles.inputLabel}>Vzhled</Text>
      <View style={styles.chipWrap}>
        {(["emoji", "image"] as TileVisualType[]).map((item) => {
          const selected = visualType === item;

          return (
            <Pressable
              key={item}
              onPress={() => onVisualTypeChange(item)}
              style={[
                styles.chip,
                styles.modeChip,
                selected && styles.chipSelected,
              ]}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {item === "emoji" ? "Emoji" : "Fotka"}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {visualType === "emoji" ? (
        <View style={styles.visualPanel}>
          <Pressable style={styles.visualButton} onPress={onOpenEmojiPicker}>
            <TileVisual emoji={previewEmoji} size={54} />

            <View style={styles.visualButtonTextWrap}>
              <Text style={styles.visualButtonTitle}>Vybrat emoji</Text>
              <Text style={styles.visualButtonSubtitle}>
                Hledání, kategorie, nedávné.
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={styles.fallbackKeyboardButton}
            onPress={onToggleEmojiKeyboard}
          >
            <Text style={styles.fallbackKeyboardText}>
              Nenašli jste správnou emoji? Zkuste normální klávesnici.
            </Text>
          </Pressable>

          {isEmojiKeyboardVisible ? (
            <View style={styles.emojiInputRow}>
              <TileVisual emoji={previewEmoji} size={54} />

              <View style={styles.emojiInputWrap}>
                <Text style={styles.visualButtonTitle}>Emoji z klávesnice</Text>
                <TextInput
                  value={emoji}
                  onChangeText={onEmojiChange}
                  style={styles.emojiInput}
                  placeholder="😊"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.visualPanel}>
          <Text style={styles.helperText}>
            Vlastní fotka z foťáku nebo knihovny.
          </Text>

          <View style={styles.photoActionRow}>
            <Pressable
              style={[styles.photoActionButton, styles.photoActionPrimary]}
              onPress={onPickImageFromLibrary}
            >
              <Text style={styles.photoActionButtonText}>Z knihovny</Text>
            </Pressable>

            <Pressable style={styles.photoActionButton} onPress={onTakePhoto}>
              <Text style={styles.photoActionButtonText}>Vyfotit</Text>
            </Pressable>

            {hasPreviewImage ? (
              <Pressable
                style={[styles.photoActionButton, styles.photoActionDanger]}
                onPress={onRemoveImage}
              >
                <Text
                  style={[
                    styles.photoActionButtonText,
                    styles.photoActionDangerText,
                  ]}
                >
                  Odebrat
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Text style={styles.visualStatus}>
            {hasPreviewImage
              ? "Fotka připravená pro dlaždici."
              : "Zatím bez fotky."}
          </Text>
        </View>
      )}
    </>
  );
};
