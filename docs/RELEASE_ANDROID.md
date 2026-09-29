# Android release and signing

## Debug build
Use Android Studio or Expo to generate a debug APK for testing.

## Release build
- Generate a signed release build in Android Studio.
- Keep the keystore and credentials in a secure secret store.
- Do not store them in Git or inside the app source tree.

## App identity
Application id must be stable and professional, for example:
- `com.erpsc.app`

## Publication
- Generate an AAB for Play Store submission.
- Do not publish without explicit approval.
