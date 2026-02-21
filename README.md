# AnaBoard

Mobile-first AAC board for quick communication.

## Stack

- Expo + React Native + TypeScript
- `expo-speech` for text-to-speech

## Current v1

- 4x4 board with category colors
- Tap tile: speaks word + appends to sentence bar
- Tap sentence token: removes token
- `Speak` button: speaks full sentence
- `Clear` button: clears sentence and stops playback

## Run

```bash
npm install
npm run ios
npm run android
npm run web
```

## Next hardening steps

1. Add parent/caregiver edit mode (custom words/icons/categories).
2. Add recorded-audio fallback for core words (iOS silent-mode reliability).
3. Add local persistence for board config and phrase history.
4. Add analytics + crash reporting + low-battery/offline QA matrix.
