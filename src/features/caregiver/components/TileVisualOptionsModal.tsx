import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { APP_THEME } from "../../../shared/constants/theme";

type TileVisualOptionsModalProps = {
  visible: boolean;
  hasPreviewImage: boolean;
  onClose: () => void;
  onSelectEmoji: () => void;
  onSelectEmojiKeyboard: () => void;
  onSelectPhotoLibrary: () => void;
  onSelectCamera: () => void;
  onRemoveImage: () => void;
};

export const TileVisualOptionsModal = ({
  visible,
  hasPreviewImage,
  onClose,
  onSelectEmoji,
  onSelectEmojiKeyboard,
  onSelectPhotoLibrary,
  onSelectCamera,
  onRemoveImage,
}: TileVisualOptionsModalProps) => {
  const actions = [
    { label: "Emoji", onPress: onSelectEmoji },
    { label: "Emoji/text z klávesnice", onPress: onSelectEmojiKeyboard },
    { label: "Fotka z knihovny", onPress: onSelectPhotoLibrary },
    { label: "Vyfotit", onPress: onSelectCamera },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={modalStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={modalStyles.sheet}>
          <Text style={modalStyles.title}>Ikona dlaždice</Text>
          <Text style={modalStyles.subtitle}>
            Vyber, jak chceš dlaždici upravit.
          </Text>

          <View style={modalStyles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                style={modalStyles.actionButton}
                onPress={action.onPress}
              >
                <Text style={modalStyles.actionText}>{action.label}</Text>
              </Pressable>
            ))}

            {hasPreviewImage ? (
              <Pressable
                style={[modalStyles.actionButton, modalStyles.destructiveButton]}
                onPress={onRemoveImage}
              >
                <Text
                  style={[modalStyles.actionText, modalStyles.destructiveText]}
                >
                  Odebrat fotku
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable style={modalStyles.cancelButton} onPress={onClose}>
            <Text style={modalStyles.cancelText}>Zrušit</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 18,
    backgroundColor: "rgba(24, 31, 45, 0.28)",
  },
  sheet: {
    borderRadius: 24,
    backgroundColor: APP_THEME.surface,
    padding: 18,
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: APP_THEME.text,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 18,
    color: APP_THEME.textMuted,
  },
  actions: {
    gap: 8,
  },
  actionButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surfaceTint,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  actionText: {
    color: APP_THEME.text,
    fontSize: 15,
    fontWeight: "700",
  },
  destructiveButton: {
    borderColor: APP_THEME.dangerBorder,
    backgroundColor: APP_THEME.dangerSoft,
  },
  destructiveText: {
    color: APP_THEME.dangerBorder,
  },
  cancelButton: {
    marginTop: 14,
    alignItems: "center",
    paddingVertical: 8,
  },
  cancelText: {
    color: APP_THEME.primaryBorder,
    fontSize: 15,
    fontWeight: "800",
  },
});
