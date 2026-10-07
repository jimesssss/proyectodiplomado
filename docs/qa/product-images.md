# Fotografías de productos

`Product.imageUrl` es una referencia HTTPS opcional (`string | null`). Los
productos anteriores siguen siendo compatibles y muestran el placeholder.
Crear o modificar una imagen utiliza las rutas de productos existentes; PATCH
conserva `product:update`, aislamiento por tenant, validación y auditoría.

Las fotografías están en `apps/web/public/product-images/`. El build existente
las copia a `apps/mobile/dist/product-images/`, publicado por el servicio web
estático de Render. No se almacena contenido binario en MongoDB, no existe un
sistema nuevo de almacenamiento ni una pantalla de subida.

El catálogo `scripts/demo-product-images.json` relaciona los 100 códigos demo
existentes con archivos deduplicados por SHA-256. Son fotografías ilustrativas
del tipo de producto; las marcas, presentaciones y pesos pueden variar. Las
fuentes originales, autores, licencias y hashes están en `credits.json`; los
créditos accesibles están en `/product-images/credits.html` y enlazados desde el
detalle. Las fotografías proceden de Wikimedia Commons y Open Food Facts.

Después de publicar API y web:

```powershell
pnpm images:demo          # preflight, sin escribir productos
pnpm images:demo --apply  # solamente PATCH { imageUrl }
pnpm images:demo --apply  # segunda ejecución: cero cambios
```

El script reutiliza `DEMO_ADMIN_PASSWORD` de los archivos de entorno existentes.
Nunca cambia contraseñas ni imprime credenciales. Verifica la organización,
identidad de cada producto y disponibilidad HTTP de todos los archivos antes
de escribir. Conserva referencias existentes accesibles, comprueba que no
cambien los demás campos ni el stock y cierra su sesión. El resultado queda
en `.cache/demo-product-images-result.json`, excluido de Git.

Web y Android utilizan `ProductImage` con la misma URL proveniente de la API.
El componente incluye miniatura, imagen grande, caché y fallback si falla la
descarga. La APK previamente instalada no recibe cambios de código: se
requiere un build posterior para incorporar esta interfaz en esa APK. Esta
tarea no genera APK.
