import { useMemo, useState } from 'react';
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
import { useResolvedMediaUri } from '../media/useResolvedMediaUri';
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

const URI_SCHEME_PATTERN = /^(blob|content|data|file|https?):/i;

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

const getVisualTextMetrics = (value: string, size: number) => {
  const trimmedValue = value.trim();
  const length = Array.from(trimmedValue).length;
  const hasWhitespace = /\s/.test(trimmedValue);
  const baseSize = Math.max(18, Math.round(size * 0.62));

  if (length <= 2 && !hasWhitespace) {
    return {
      fontSize: baseSize,
      width: size,
      numberOfLines: 1 as const,
    };
  }

  if (length <= 4 && !hasWhitespace) {
    const nextSize = Math.max(16, Math.round(size * 0.46));
    return {
      fontSize: nextSize,
      width: size,
      numberOfLines: 1 as const,
    };
  }

  if (length <= 7 && !hasWhitespace) {
    const nextSize = Math.max(14, Math.round(size * 0.34));
    return {
      fontSize: nextSize,
      lineHeight: nextSize + 2,
      width: size * 0.94,
      numberOfLines: 2 as const,
    };
  }

  const nextSize = Math.max(12, Math.round(size * 0.24));
  return {
    fontSize: nextSize,
    lineHeight: nextSize + 2,
    width: size * 0.96,
    numberOfLines: 2 as const,
  };
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
  const resolvedImageLocalUri = useResolvedMediaUri(imageLocalUri);
  const imageUri = useMemo(
    () => getImageUri(resolvedImageLocalUri, imageRemotePath),
    [imageRemotePath, resolvedImageLocalUri]
  );
  const contentKey =
    visualType === 'image' && imageUri ? `image:${imageUri}` : `emoji:${emoji}:${size}`;

  return (
    <TileVisualFrame
      key={contentKey}
      emoji={emoji}
      visualType={visualType}
      imageUri={imageUri}
      size={size}
      cornerRadius={cornerRadius}
      style={style}
      emojiStyle={emojiStyle}
    />
  );
};

type TileVisualFrameProps = {
  emoji: string;
  visualType: TileVisualType;
  imageUri: string | null;
  size: number;
  cornerRadius: number;
  style?: StyleProp<ViewStyle>;
  emojiStyle?: StyleProp<TextStyle>;
};

const TileVisualFrame = ({
  emoji,
  visualType,
  imageUri,
  size,
  cornerRadius,
  style,
  emojiStyle,
}: TileVisualFrameProps) => {
  const [didImageFail, setDidImageFail] = useState(false);
  const showImage = visualType === 'image' && Boolean(imageUri) && !didImageFail;
  const textMetrics = getVisualTextMetrics(emoji || '⬜️', size);

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
          numberOfLines={textMetrics.numberOfLines}
          ellipsizeMode="clip"
          style={[
            styles.emoji,
            {
              fontSize: textMetrics.fontSize,
              width: textMetrics.width,
            },
            textMetrics.lineHeight
              ? {
                  lineHeight: textMetrics.lineHeight,
                }
              : null,
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
