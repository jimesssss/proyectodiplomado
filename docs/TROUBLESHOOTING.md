# Troubleshooting

## Android Studio
- Check JDK and Android SDK installation.
- Ensure `ANDROID_HOME` is configured.
- Sync Gradle and confirm the emulator image is installed.

## Metro / Expo
- Restart Metro with `npx expo start --clear`.
- Check if the local API is reachable from the emulator or device.

## API connection
- Emulator: use `10.0.2.2` instead of `localhost`.
- Physical device: use your computer LAN IP.
- Production: use the Render HTTPS URL.

## CORS
- Ensure the API allows the web app and mobile origin list.
- Keep a strict allowlist instead of `*` in production.

## Render
- Check Node version and build logs.
- Confirm `PORT` is set correctly.
- Ensure `MONGODB_URI` and JWT secrets are present in secrets.

## MongoDB
- Verify the Atlas connection string and IP allowlist.
- Do not log connection strings or secrets.
