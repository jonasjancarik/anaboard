import { StyleSheet } from 'react-native';

export const GRID_COLUMNS = 4;
export const GRID_GAP = 10;
export const LAYOUT_PADDING = 12;
export const MAX_TILE_SIZE = 180;
export const MIN_TILE_SIZE = 58;

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
    width: 100,
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
  caregiverButton: {
    backgroundColor: '#EAE7FF',
    borderColor: '#9E93FF',
  },
  caregiverButtonUnlocked: {
    backgroundColor: '#E8F8EC',
    borderColor: '#8CD1A0',
  },
  actionText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  clearText: {
    color: '#B23845',
  },
  caregiverText: {
    color: '#3D338A',
  },
  caregiverTextUnlocked: {
    color: '#1F6E39',
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: LAYOUT_PADDING,
    paddingBottom: LAYOUT_PADDING,
  },
  grid: {
    width: '100%',
    maxWidth: 760,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: GRID_GAP,
    position: 'relative',
  },
  tile: {
    borderRadius: 20,
    borderWidth: 3,
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
    fontSize: 34,
  },
  tileLabel: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    color: '#0E203A',
  },
});
