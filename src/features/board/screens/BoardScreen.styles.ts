import { StyleSheet } from 'react-native';

import { APP_THEME } from '../../../shared/constants/theme';

export const GRID_COLUMNS = 4;
export const GRID_ROWS = 4;
export const GRID_GAP = 10;
export const LAYOUT_PADDING = 12;
export const MAX_TILE_SIZE = 180;
export const MIN_TILE_SIZE = 58;
export const MAX_GRID_WIDTH = 760;

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: APP_THEME.background,
  },
  topRow: {
    paddingTop: 10,
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: 16,
    gap: 12,
  },
  sentenceBox: {
    width: '100%',
    minHeight: 92,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
    paddingVertical: 10,
    paddingHorizontal: 8,
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  sentenceContent: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 6,
  },
  placeholderText: {
    fontSize: 16,
    fontWeight: '800',
    color: APP_THEME.textMuted,
    paddingHorizontal: 8,
  },
  token: {
    height: 48,
    borderRadius: 14,
    backgroundColor: APP_THEME.surfaceAlt,
    borderWidth: 1,
    borderColor: APP_THEME.borderSoft,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tokenEmojiOnly: {
    width: 46,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  tokenPressed: {
    transform: [{ scale: 0.97 }],
  },
  tokenEmoji: {
    fontSize: 20,
  },
  tokenText: {
    fontSize: 17,
    fontWeight: '800',
    color: APP_THEME.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  actionButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  speakButton: {
    backgroundColor: APP_THEME.successSoft,
    borderColor: APP_THEME.success,
  },
  savePhraseButton: {
    backgroundColor: APP_THEME.warningSoft,
    borderColor: APP_THEME.warning,
  },
  clearButton: {
    backgroundColor: APP_THEME.dangerSoft,
    borderColor: APP_THEME.danger,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '800',
    color: APP_THEME.text,
  },
  actionIcon: {
    fontSize: 18,
    lineHeight: 22,
  },
  speakText: {
    color: APP_THEME.successBorder,
  },
  savePhraseText: {
    color: APP_THEME.warningBorder,
  },
  clearText: {
    color: APP_THEME.dangerBorder,
  },
  reorderModeButton: {
    backgroundColor: APP_THEME.warningSoft,
    borderColor: APP_THEME.warning,
  },
  reorderModeButtonActive: {
    backgroundColor: '#F2DBB7',
    borderColor: APP_THEME.warningBorder,
  },
  reorderModeText: {
    color: APP_THEME.warningBorder,
  },
  reorderModeTextActive: {
    color: '#734E22',
  },
  editorHintError: {
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: 6,
    marginTop: 4,
    textAlign: 'center',
    color: APP_THEME.dangerBorder,
    fontSize: 12,
    fontWeight: '700',
  },
  editorHintSuccess: {
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: 6,
    marginTop: 4,
    textAlign: 'center',
    color: APP_THEME.successBorder,
    fontSize: 12,
    fontWeight: '700',
  },
  boardArea: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 10,
    paddingBottom: LAYOUT_PADDING,
  },
  boardPagerViewport: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
  },
  boardPagerScroll: {
    flex: 1,
  },
  pagesStrip: {
    flexDirection: 'row',
    position: 'relative',
  },
  page: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  spread: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  spreadPagesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pageSpacer: {
    opacity: 0,
  },
  pageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignContent: 'flex-start',
    gap: GRID_GAP,
    position: 'relative',
  },
  pageControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  caregiverActionRow: {
    marginTop: 10,
  },
  addTileButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: APP_THEME.primary,
    backgroundColor: APP_THEME.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  addTileButtonText: {
    color: APP_THEME.primaryBorder,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  bottomBar: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    gap: 10,
  },
  bottomBarSide: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  bottomBarSideRight: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  lockButton: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_THEME.surface,
    borderColor: APP_THEME.border,
  },
  lockButtonUnlocked: {
    backgroundColor: APP_THEME.warningSoft,
    borderColor: APP_THEME.warning,
  },
  lockButtonText: {
    fontSize: 22,
    lineHeight: 24,
    color: APP_THEME.text,
  },
  lockButtonTextUnlocked: {
    color: APP_THEME.warningBorder,
  },
  settingsCogButton: {
    width: 46,
    height: 46,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_THEME.surface,
    borderColor: APP_THEME.border,
  },
  settingsCogButtonUnlocked: {
    backgroundColor: APP_THEME.primarySoft,
    borderColor: APP_THEME.primary,
  },
  settingsCogText: {
    fontSize: 22,
    lineHeight: 24,
    color: APP_THEME.text,
  },
  settingsCogTextUnlocked: {
    color: APP_THEME.primaryBorder,
  },
  pageControlButton: {
    minWidth: 46,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pageControlButtonDisabled: {
    opacity: 0.35,
  },
  pageControlText: {
    color: APP_THEME.text,
    fontSize: 16,
    fontWeight: '900',
  },
  pageIndicatorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  pageDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: APP_THEME.borderStrong,
  },
  pageDotActive: {
    width: 24,
    backgroundColor: APP_THEME.primary,
  },
  tile: {
    borderRadius: 24,
    borderWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 10,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  tileHighContrast: {
    borderWidth: 2,
  },
  tilePressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.94,
  },
  tilePlaceholder: {
    opacity: 0.22,
  },
  newTileFlashOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 24,
    backgroundColor: '#FFF0A8',
  },
  dragOverlayTile: {
    position: 'absolute',
    borderRadius: 20,
    borderWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 40,
    elevation: 14,
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
  },
  dragOverlayTileHighContrast: {
    borderWidth: 2,
  },
  tileEmoji: {
    fontSize: 34,
  },
  tileLabel: {
    width: '90%',
    marginTop: 6,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '800',
    textAlign: 'center',
    color: APP_THEME.text,
  },
});
