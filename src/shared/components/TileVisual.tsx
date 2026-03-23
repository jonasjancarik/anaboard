import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { APP_THEME } from '../constants/theme';
import type { TileVisualType } from '../types/domain';

type TileVisualProps = {
  emoji: string;
  visualType?: TileVisualType;
  imageLocalUri?: string | null;
  imageRemotePath?: string | null;
  size: number;
  cornerRadius?: number;
  style?: StyleProp<ViewStyle>;
  emojiStyle?: StyleProp<TextStyle>;
};

const URI_SCHEME_PATTERN = /^(file|content|https?):/i;

const getImageUri = (
  imageLocalUri?: string | null,
  imageRemotePath?: string | null,
): string | null => {
  if (imageLocalUri) {
    return imageLocalUri;
  }

  if (imageRemotePath && URI_SCHEME_PATTERN.test(imageRemotePath)) {
    return imageRemotePath;
  }

  return null;
};

export const TileVisual = ({
  emoji,
  visualType = 'emoji',
  imageLocalUri,
  imageRemotePath,
  size,
  cornerRadius = Math.max(12, Math.round(size * 0.24)),
  style,
  emojiStyle,
}: TileVisualProps) => {
  const [didImageFail, setDidImageFail] = useState(false);
  const imageUri = useMemo(
    () => getImageUri(imageLocalUri, imageRemotePath),
    [imageLocalUri, imageRemotePath]
  );

  useEffect(() => {
    setDidImageFail(false);
  }, [imageUri]);

  const showImage = visualType === 'image' && Boolean(imageUri) && !didImageFail;
  const emojiSize = Math.max(18, Math.round(size * 0.62));

  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: cornerRadius,
          backgroundColor: showImage ? APP_THEME.surfaceTint : 'transparent',
        },
        style,
      ]}
    >
      {showImage && imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: cornerRadius }]}
          resizeMode="cover"
          onError={() => {
            setDidImageFail(true);
          }}
        />
      ) : (
        <Text
          allowFontScaling={false}
          style={[
            styles.emoji,
            {
              fontSize: emojiSize,
              lineHeight: emojiSize + 2,
            },
            emojiStyle,
          ]}
        >
          {emoji || '⬜️'}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    textAlign: 'center',
  },
});
