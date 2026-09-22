# Arquitectura — Mobile (React Native + Kotlin)

Estado: Aceptado (FASE 1)

## 1. Principios

- `apps/mobile` es **React Native** con el mismo diseño, `api-client`, permisos y theme que `apps/web`.
- **No existe backend separado en Kotlin.** Kotlin es solo una capa de puente nativo.
- Kotlin se usa **únicamente** cuando React Native no puede resolver adecuadamente:
  - APIs nativas de Android sin módulo RN maduro.
  - Bluetooth especializado (p. ej. impresoras térmicas).
  - NFC (lectura de etiquetas/identificaciones).
  - Escáner de código de barras por hardware dedicado.
  - Impresoras POS / hardware POS.
  - Servicios Android especializados (foreground services, intents de sistema).

## 2. Estructura

```
apps/mobile/
├── src/                 # TypeScript/React Native (igual que frontend.md)
├── android/
│   └── app/src/main/java/.../
│       ├── scanner/      # Native module: escáner
│       ├── nfc/          # Native module: NFC
│       ├── bluetooth/    # Native module: impresoras
│       └── pos/          # Native module: hardware POS
└── ios/                  # Puentes equivalentes solo si el hardware lo requiere
```

## 3. Contrato del puente nativo

- Cada módulo Kotlin expone una API JS pequeña y tipada (ej. `ScannerModule.start(): Promise<string>`).
- Los puentes **no contienen lógica empresarial**, no conocen tenants, no hablan con MongoDB.
- Si el puente falla, la app degrada (ej. input manual del escáner) en lugar de romperse.
- Permisos de Android (`CAMERA`, `NFC`, `BLUETOOTH_CONNECT`…) declarados y solicitados en runtime.

## 4. Seguridad móvil

- Access token en memoria; refresh en Keystore/Keychain (secure storage).
- Certificado pinning opcional evaluable en FASE 20 (NOT TESTED; no bloqueante).
- Screenshots de datos sensibles y app-switcher blur: evaluar por pantalla (posterior).
- Logs sin PII ni tokens.

## 5. Distribución

- Android: build tipo debug/release; firma de release pendiente de definir con el cliente.
- iOS: fuera del alcance inicial salvo petición (RISK: pendiente de confirmar).

## 6. Estado actual

**NOT TESTED / no existe.** No se ha creado `apps/mobile` ni ningún módulo Kotlin. Regla: no crear puentes Kotlin hasta que exista una funcionalidad concreta que RN no resuelva.
