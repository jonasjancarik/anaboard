import { StyleSheet } from 'react-native';

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
    backgroundColor: '#F3F7FC',
  },
  topRow: {
    paddingTop: 8,
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: 10,
    flexDirection: 'row',
    gap: 10,
  },
  sentenceBox: {
    flex: 1,
    minHeight: 88,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#C6D5E7',
    backgroundColor: '#EAF2FB',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  sentenceContent: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  placeholderText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#4E617A',
    paddingHorizontal: 8,
  },
  token: {
    height: 46,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6DFEB',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
    color: '#10213A',
  },
  actions: {
    width: 92,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  actionButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  speakButton: {
    backgroundColor: '#26A949',
    borderColor: '#1A8939',
  },
  clearButton: {
    backgroundColor: '#FFF0F0',
    borderColor: '#EEB0B2',
  },
  actionText: {
    paddingHorizontal: 4,
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  clearText: {
    color: '#B23845',
  },
  reorderModeButton: {
    backgroundColor: '#FFF3E5',
    borderColor: '#E8B37A',
  },
  reorderModeButtonActive: {
    backgroundColor: '#FFD6A6',
    borderColor: '#D6882B',
  },
  reorderModeText: {
    color: '#8A541D',
  },
  reorderModeTextActive: {
    color: '#6C3D11',
  },
  editorHintWrap: {
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: 2,
  },
  editorHint: {
    textAlign: 'center',
    color: '#4B607E',
    fontSize: 13,
    fontWeight: '600',
  },
  editorHintError: {
    marginTop: 4,
    textAlign: 'center',
    color: '#A62839',
    fontSize: 12,
    fontWeight: '700',
  },
  boardArea: {
    flex: 1,
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: LAYOUT_PADDING,
  },
  boardPagerViewport: {
    flex: 1,
    width: '100%',
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
    gap: 10,
  },
  bottomBar: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    gap: 10,
  },
  bottomBarSide: {
    minWidth: 72,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  bottomBarSideRight: {
    minWidth: 72,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  utilityButton: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#FFF3E5',
    borderColor: '#E8B37A',
  },
  utilityButtonActive: {
    backgroundColor: '#FFD6A6',
    borderColor: '#D6882B',
  },
  utilityButtonText: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: '#8A541D',
    textAlign: 'center',
  },
  utilityButtonTextActive: {
    color: '#6C3D11',
  },
  settingsCogButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#CCD8ED',
  },
  settingsCogButtonUnlocked: {
    backgroundColor: '#E8F8EC',
    borderColor: '#8CD1A0',
  },
  settingsCogText: {
    fontSize: 22,
    lineHeight: 24,
    color: '#334764',
  },
  settingsCogTextUnlocked: {
    color: '#1F6E39',
  },
  pageControlButton: {
    minWidth: 46,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CCD8ED',
    backgroundColor: '#F5F8FD',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  pageControlButtonDisabled: {
    opacity: 0.35,
  },
  pageControlText: {
    color: '#243755',
    fontSize: 18,
    fontWeight: '900',
  },
  pageIndicatorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pageDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#C9D5E8',
  },
  pageDotActive: {
    width: 22,
    backgroundColor: '#355C9B',
  },
  pageCounter: {
    color: '#415978',
    fontSize: 13,
    fontWeight: '700',
    minWidth: 42,
    textAlign: 'center',
  },
  tile: {
    borderRadius: 20,
    borderWidth: 3,
    paddingHorizontal: 6,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#192233',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 4,
  },
  tilePressed: {
    transform: [{ scale: 0.93 }],
    opacity: 0.9,
  },
  tilePlaceholder: {
    opacity: 0.22,
  },
  dragOverlayTile: {
    position: 'absolute',
    borderRadius: 20,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 40,
    elevation: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    transform: [{ scale: 1.06 }],
  },
  tileEmoji: {
    fontSize: 32,
  },
  tileLabel: {
    width: '88%',
    marginTop: 4,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'uppercase',
    color: '#0E203A',
  },
});
