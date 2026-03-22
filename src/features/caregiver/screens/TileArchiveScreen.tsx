import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORY_COLORS, SPEECH_MODE_LABELS } from '../../../shared/constants/defaults';
import { APP_THEME } from '../../../shared/constants/theme';
import { getArchivedTilesForBoard, restoreArchivedTileToBoard } from '../../../shared/storage/repositories/tileArchiveRepository';
import type { ArchivedTile } from '../../../shared/types/domain';
import { useAppStore } from '../../../store/useAppStore';

type TileArchiveScreenProps = {
  onBack: () => void;
};

const formatDeletedAt = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'nedávno';
  }

  return date.toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const TileArchiveScreen = ({ onBack }: TileArchiveScreenProps) => {
  const board = useAppStore((state) => state.board);
  const refreshBoard = useAppStore((state) => state.refreshBoard);
  const refreshPendingSyncEvents = useAppStore((state) => state.refreshPendingSyncEvents);

  const [archivedTiles, setArchivedTiles] = useState<ArchivedTile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [restoringArchiveId, setRestoringArchiveId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const loadArchivedTiles = async () => {
      if (!board) {
        if (!isCancelled) {
          setArchivedTiles([]);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      try {
        const nextTiles = await getArchivedTilesForBoard(board.id);
        if (!isCancelled) {
          setArchivedTiles(nextTiles);
        }
      } catch (error) {
        if (!isCancelled) {
          setMessage(error instanceof Error ? error.message : 'Archiv se nepovedlo načíst');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadArchivedTiles();

    return () => {
      isCancelled = true;
    };
  }, [board]);

  const handleRestore = async (archiveId: string) => {
    setRestoringArchiveId(archiveId);
    setMessage(null);

    try {
      await restoreArchivedTileToBoard(archiveId);
      await refreshBoard();
      await refreshPendingSyncEvents();
      if (board) {
        setArchivedTiles(await getArchivedTilesForBoard(board.id));
      }
      setMessage('Dlaždice vrácena na konec tabule');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Vrácení dlaždice selhalo');
    } finally {
      setRestoringArchiveId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.headerRow}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Zpět</Text>
        </Pressable>
        <Text style={styles.title}>Archiv dlaždic</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <Text style={styles.helperText}>
        Smazané dlaždice vrátíš jedním klepnutím. Obnovená dlaždice se přidá na konec tabule, pak ji přesuň přes režim PŘESUN.
      </Text>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isLoading ? <Text style={styles.infoText}>Načítám archiv…</Text> : null}

        {!isLoading && archivedTiles.length === 0 ? (
          <Text style={styles.infoText}>Archiv je zatím prázdný.</Text>
        ) : null}

        {!isLoading
          ? archivedTiles.map((tile) => {
              const colors = CATEGORY_COLORS[tile.category];
              const isRestoring = restoringArchiveId === tile.archiveId;

              return (
                <View
                  key={tile.archiveId}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardEmoji}>{tile.emoji}</Text>
                    <View style={styles.cardTextWrap}>
                      <Text style={styles.cardTitle}>{tile.labelCs}</Text>
                      <Text style={styles.cardMeta}>
                        {SPEECH_MODE_LABELS[tile.speechMode]} · původně #{tile.originalPosition + 1}
                      </Text>
                      <Text style={styles.cardMeta}>Smazáno {formatDeletedAt(tile.deletedAt)}</Text>
                      {tile.audioClip ? <Text style={styles.cardMeta}>Obsahuje nahrávku</Text> : null}
                    </View>
                  </View>

                  <Pressable
                    style={[styles.restoreButton, isRestoring && styles.restoreButtonDisabled]}
                    onPress={() => {
                      void handleRestore(tile.archiveId);
                    }}
                    disabled={isRestoring}
                  >
                    <Text style={styles.restoreButtonText}>{isRestoring ? 'Vrací se…' : 'Vrátit na tabuli'}</Text>
                  </Pressable>
                </View>
              );
            })
          : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: APP_THEME.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    gap: 10,
  },
  backButton: {
    minWidth: 86,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: APP_THEME.border,
    backgroundColor: APP_THEME.surface,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  backButtonText: {
    color: APP_THEME.text,
    fontWeight: '800',
  },
  backButtonPlaceholder: {
    minWidth: 86,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: APP_THEME.text,
  },
  helperText: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    textAlign: 'center',
    color: APP_THEME.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  content: {
    padding: 12,
    gap: 12,
    paddingBottom: 28,
  },
  infoText: {
    textAlign: 'center',
    color: APP_THEME.textMuted,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 24,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 14,
    gap: 12,
    shadowColor: APP_THEME.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  cardEmoji: {
    fontSize: 30,
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: APP_THEME.text,
  },
  cardMeta: {
    marginTop: 3,
    color: APP_THEME.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  restoreButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: APP_THEME.successBorder,
    backgroundColor: APP_THEME.success,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  restoreButtonDisabled: {
    opacity: 0.5,
  },
  restoreButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  message: {
    textAlign: 'center',
    color: APP_THEME.message,
    fontWeight: '700',
    paddingTop: 6,
  },
});
