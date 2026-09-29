# Android Studio setup

## Required tools
- Node.js 18+
- npm or pnpm
- Android Studio
- Android SDK 34+
- JDK 17 or 21 compatible with the React Native/Expo toolchain

## Environment variables
- Use `.env` for local development
- Keep only public values in the client app
- Example: `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:4000/api/v1`

## Android emulator
1. Open Android Studio.
2. Create a virtual device (AVD) with API 34 or newer.
3. Start the emulator.
4. Run `npx expo start --android` from the mobile app.
5. If using a physical device, enable Developer Options and USB debugging.

## Local API access
- Android emulator: use `http://10.0.2.2:4000/api/v1`
- Physical device on the same network: use your PC local IP, for example `http://192.168.1.50:4000/api/v1`
- Production: use `https://<your-render-url>/api/v1`

Never hardcode personal machine IPs in production builds.
