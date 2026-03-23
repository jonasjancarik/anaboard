import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { APP_THEME } from "../../../shared/constants/theme";

type EmojiKeyboardModalProps = {
  visible: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
};

export const EmojiKeyboardModal = ({
  visible,
  value,
  onChange,
  onClose,
}: EmojiKeyboardModalProps) => {
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
          <Text style={modalStyles.title}>Emoji/text z klávesnice</Text>
          <Text style={modalStyles.subtitle}>
            Vlož emoji nebo krátký text přímo z normální klávesnice telefonu.
          </Text>

          <TextInput
            value={value}
            onChangeText={onChange}
            style={modalStyles.input}
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
          />

          <Pressable style={modalStyles.doneButton} onPress={onClose}>
            <Text style={modalStyles.doneText}>Hotovo</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 18,
    paddingTop: 88,
    paddingBottom: 18,
    backgroundColor: "rgba(24, 31, 45, 0.28)",
  },
  sheet: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
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
  input: {
    minHeight: 70,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: APP_THEME.borderStrong,
    backgroundColor: APP_THEME.surfaceTint,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 34,
    lineHeight: 38,
    textAlign: "center",
    color: APP_THEME.text,
  },
  doneButton: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.primaryBorder,
    backgroundColor: APP_THEME.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  doneText: {
    color: APP_THEME.primaryBorder,
    fontSize: 15,
    fontWeight: "800",
  },
});
