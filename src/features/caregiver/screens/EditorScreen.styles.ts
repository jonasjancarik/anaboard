import { StyleSheet } from "react-native";

import { APP_THEME } from "../../../shared/constants/theme";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_THEME.background,
  },
  content: {
    flex: 1,
  },
  editorScroll: {
    flex: 1,
  },
  editorBody: {
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    gap: 10,
  },
  editorPanelContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 20,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: APP_THEME.text,
  },
  tilePreviewWrap: {
    alignItems: "center",
  },
  tilePreview: {
    width: 144,
    height: 144,
    borderRadius: 24,
    borderWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  tilePreviewHighContrast: {
    backgroundColor: "#FFFFFF",
    borderColor: "#111827",
    borderWidth: 2,
  },
  tilePreviewLabel: {
    width: "90%",
    marginTop: 10,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    textAlign: "center",
    color: APP_THEME.text,
  },
  divider: {
    height: 1,
    backgroundColor: APP_THEME.borderSoft,
  },
  fieldBlock: {
    gap: 4,
  },
  inputLabel: {
    color: APP_THEME.text,
    fontSize: 15,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderColor: APP_THEME.borderStrong,
    borderRadius: 16,
    backgroundColor: APP_THEME.surface,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: APP_THEME.text,
  },
  helperText: {
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  visualPanel: {
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: APP_THEME.borderSoft,
    backgroundColor: APP_THEME.surfaceTint,
    padding: 14,
  },
  visualButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  visualButtonTextWrap: {
    flex: 1,
    gap: 2,
  },
  emojiInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emojiInputWrap: {
    flex: 1,
    gap: 4,
  },
  emojiInput: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 28,
    lineHeight: 32,
    textAlign: "center",
    color: APP_THEME.text,
  },
  visualButtonTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: APP_THEME.text,
  },
  visualButtonSubtitle: {
    fontSize: 13,
    color: APP_THEME.textMuted,
  },
  fallbackKeyboardButton: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  fallbackKeyboardText: {
    color: APP_THEME.primaryBorder,
    fontSize: 13,
    fontWeight: "700",
  },
  visualStatus: {
    color: APP_THEME.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  photoActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoActionButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.borderStrong,
    backgroundColor: APP_THEME.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  photoActionPrimary: {
    borderColor: APP_THEME.primaryBorder,
    backgroundColor: APP_THEME.primarySoft,
  },
  photoActionDanger: {
    borderColor: APP_THEME.dangerBorder,
  },
  photoActionButtonText: {
    color: APP_THEME.text,
    fontSize: 14,
    fontWeight: "800",
  },
  photoActionDangerText: {
    color: APP_THEME.dangerBorder,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: APP_THEME.surface,
  },
  categoryChip: {
    minWidth: 68,
    alignItems: "center",
  },
  modeChip: {
    minHeight: 42,
    justifyContent: "center",
  },
  chipSelected: {
    borderColor: APP_THEME.primaryBorder,
    borderWidth: 2,
    opacity: 1,
  },
  categoryChipSelected: {
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 1,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "700",
    color: APP_THEME.text,
  },
  categoryChipText: {
    color: APP_THEME.text,
  },
  chipTextSelected: {
    color: APP_THEME.text,
  },
  recordingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between",
  },
  error: {
    color: APP_THEME.dangerBorder,
    marginTop: -2,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 16,
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  inlineActionButton: {
    minWidth: 88,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  recordButton: {
    borderColor: APP_THEME.successBorder,
    backgroundColor: APP_THEME.success,
  },
  stopButton: {
    borderColor: APP_THEME.dangerBorder,
    backgroundColor: APP_THEME.danger,
  },
  deleteRecordingButton: {
    borderColor: APP_THEME.dangerBorder,
    backgroundColor: APP_THEME.surface,
  },
  saveButton: {
    borderColor: APP_THEME.primaryBorder,
    backgroundColor: APP_THEME.primary,
  },
  tileActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  tileActionButton: {
    flex: 1,
  },
  deleteTileButton: {
    borderColor: APP_THEME.dangerBorder,
    backgroundColor: APP_THEME.surface,
  },
  deleteTileButtonText: {
    color: APP_THEME.dangerBorder,
  },
  emptyText: {
    color: APP_THEME.textMuted,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
    paddingTop: 40,
  },
});
