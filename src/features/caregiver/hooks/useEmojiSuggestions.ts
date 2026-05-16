import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { aiClient } from "../../ai/aiClient";
import { logError, logEvent } from "../../../shared/telemetry/logger";
import type { EmojiSuggestion } from "../../../shared/ai/contracts";
import { getAppCopy } from "../../../shared/i18n/appCopy";
import type { Category } from "../../../shared/types/domain";

const REQUEST_TIMEOUT_MS = 60000;

const createTimeoutError = (locale: unknown) =>
  new Error(getAppCopy(locale).emojiSuggestion.timeout);

const withTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  locale: unknown,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createTimeoutError(locale));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

type UseEmojiSuggestionsParams = {
  enabled: boolean;
  label: string;
  locale: string;
  category?: Category;
  existingEmoji?: string;
};

export const useEmojiSuggestions = ({
  enabled,
  label,
  locale,
  category,
  existingEmoji,
}: UseEmojiSuggestionsParams) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<EmojiSuggestion[]>([]);
  const requestIdRef = useRef(0);
  const normalizedLabel = label.trim();
  const copy = getAppCopy(locale).emojiSuggestion;
  const resetKey = useMemo(
    () => `${normalizedLabel.toLocaleLowerCase(locale)}|${locale}|${category ?? ""}`,
    [category, locale, normalizedLabel]
  );

  useEffect(() => {
    setSuggestions([]);
    setError(null);
    setIsLoading(false);
  }, [resetKey]);

  const clearSuggestions = useCallback(() => {
    requestIdRef.current += 1;
    setSuggestions([]);
    setError(null);
    setIsLoading(false);
  }, []);

  const requestSuggestions = useCallback(async () => {
    if (!enabled) {
      return;
    }

    if (!normalizedLabel) {
      setSuggestions([]);
      setError(copy.labelRequired);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    setError(null);
    const startedAtMs = Date.now();

    try {
      const response = await withTimeout(
        aiClient.suggestEmoji({
          label: normalizedLabel,
          locale,
          category,
          existingEmoji,
        }),
        REQUEST_TIMEOUT_MS,
        locale
      );

      if (requestIdRef.current !== requestId) {
        return;
      }

      setSuggestions(response.suggestions);
      logEvent("ai_emoji_suggest_success", {
        duration_ms: Date.now() - startedAtMs,
        cached: response.cached,
        suggestion_count: response.suggestions.length,
        locale,
        category: category ?? null,
        label_length: normalizedLabel.length,
      });
      if (response.suggestions.length === 0) {
        setError(copy.noneFound);
      }
    } catch (requestError) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setSuggestions([]);
      logError("ai_emoji_suggest_error", requestError, {
        duration_ms: Date.now() - startedAtMs,
        timeout: requestError instanceof Error && requestError.message === createTimeoutError(locale).message,
        locale,
        category: category ?? null,
        label_length: normalizedLabel.length,
      });
      setError(
        requestError instanceof Error
          ? requestError.message
          : copy.failed
      );
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [category, copy, enabled, existingEmoji, locale, normalizedLabel]);

  return {
    clearSuggestions,
    error,
    isLoading,
    requestSuggestions,
    suggestions,
  };
};
