import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { APP_THEME } from "../../../shared/constants/theme";
import { getAppCopy } from "../../../shared/i18n/appCopy";

type TileVisualOptionsModalProps = {
  visible: boolean;
  hasPreviewImage: boolean;
  showGenerateImageAction: boolean;
  canGenerateImage: boolean;
  isGeneratingImage: boolean;
  onClose: () => void;
  onSelectEmoji: () => void;
  onSelectEmojiKeyboard: () => void;
  onSelectPhotoLibrary: () => void;
  onSelectCamera: () => void;
  onGenerateImage: () => void;
  onRemoveImage: () => void;
  locale?: unknown;
};

export const TileVisualOptionsModal = ({
  visible,
  hasPreviewImage,
  showGenerateImageAction,
  canGenerateImage,
  isGeneratingImage,
  onClose,
  onSelectEmoji,
  onSelectEmojiKeyboard,
  onSelectPhotoLibrary,
  onSelectCamera,
  onGenerateImage,
  onRemoveImage,
  locale,
}: TileVisualOptionsModalProps) => {
  const copy = getAppCopy(locale).tileVisualOptions;
  const actions = [
    { label: "Emoji", onPress: onSelectEmoji, disabled: false },
    {
      label: copy.keyboardEmoji,
      onPress: onSelectEmojiKeyboard,
      disabled: false,
    },
    { label: copy.photoLibrary, onPress: onSelectPhotoLibrary, disabled: false },
    { label: copy.camera, onPress: onSelectCamera, disabled: false },
    ...(showGenerateImageAction
      ? [
          {
            label: isGeneratingImage ? copy.generatingImage : copy.generateImage,
            onPress: onGenerateImage,
            disabled: !canGenerateImage || isGeneratingImage,
          },
        ]
      : []),
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
          <Text style={modalStyles.title}>{copy.title}</Text>
          <Text style={modalStyles.subtitle}>
            {copy.subtitle}
          </Text>

          <View style={modalStyles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.label}
                style={[
                  modalStyles.actionButton,
                  action.disabled && modalStyles.actionButtonDisabled,
                ]}
                onPress={action.onPress}
                disabled={action.disabled}
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
                  {copy.removePhoto}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable style={modalStyles.cancelButton} onPress={onClose}>
            <Text style={modalStyles.cancelText}>{getAppCopy(locale).common.cancel}</Text>
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
    boxShadow: '0px 14px 24px rgba(31, 26, 20, 0.16)',
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
  actionButtonDisabled: {
    opacity: 0.45,
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
