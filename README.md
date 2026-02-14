# LogixMobile

Aplicación móvil para la gestión de inventario y logística, desarrollada con React Native.

## 📱 Módulos Implementados

La aplicación cuenta con 4 módulos principales totalmente funcionales:

### 1. Stock (Consulta de Inventario)
- Búsqueda de items por código o descripción.
- Escaneo de códigos QR/Barras.
- Visualización de detalles: Ubicación (Bin), Cantidad Física, Bins Adicionales, ABC.

### 2. Conteos Cíclicos (Cycle Counts)
- Planificación diaria de conteos.
- Selección de fecha mediante calendario.
- Lista de items programados.
- Ingreso de cantidades físicas.
- Guardado masivo de conteos.
- Indicadores visuales de estado (Pendiente, Contado, Guardado).

### 3. Auditoría de Picking (Picking Audit)
- Carga de pedidos por Número de Orden + Despatch.
- Historial de pedidos recientes.
- Auditoría activa: Escaneo de items contra requerimientos.
- Feedback visual y vibración (Correcto/Incorrecto/Exceso).
- Cálculo de diferencias.
- Cierre de auditoría con conteo de bultos.

### 4. Inbound (Recepción) - ⚡ Optimizado
- Registro de entrada de mercancía.
- Búsqueda optimizada de items (Caché en memoria O(1)).
- Carga diferida (Lazy loading) de registros log.
- Paginación para alto rendimiento.
- Edición y eliminación de registros.

---

## 🛠️ Requisitos e Instalación

### Requisitos Previos
- Node.js > 18
- Java JDK 17
- Android Studio & SDK
- Dispositivo Android o Emulador

### Instalación de Dependencias
```bash
npm install
```

### Ejecutar en Desarrollo
1. **Verificar Dispositivos Conectados:**
   Asegúrate de que tu dispositivo tiene activada la "Depuración por USB" y ejecútalo para confirmar que es detectado:
   ```bash
   adb devices
   ```

2. **Iniciar Metro Bundler:**
   ```bash
   npm start
   ```
3. **Instalar en Android:**
   Si tienes un solo dispositivo:
   ```bash
   npm run android
   ```
   Si tienes múltiples dispositivos, usa el ID obtenido en `adb devices`:
   ```bash
   npx react-native run-android --device <ID_DEL_DISPOSITIVO>
   ```
   # o directamente con gradle
   cd android && ./gradlew installDebug
1
---

## 🚀 Generar APK de Producción (Release)

El proyecto está configurado para generar APKs firmados automáticamente y sincronizar la versión con `package.json`.

### 1. Actualizar Versión (Importante)
Para subir la versión de la app (necesario para actualizaciones), usa uno de los siguientes comandos en la raíz del proyecto:
```bash
npm version patch  # ej: 0.0.1 -> 0.0.2
# o
npm version minor  # ej: 0.0.1 -> 0.1.0
# o
npm version major  # ej: 0.0.1 -> 1.0.0
```
Esto actualizará automáticamente el `versionCode` y `versionName` en la configuración de Android.

### 2. Generar el APK
```bash
cd android && ./gradlew assembleRelease
```

### 3. Ubicación del archivo
El APK generado se llamará `LogixMobile.apk` y se encontrará en:
`android/app/build/outputs/apk/release/LogixMobile.apk`


---

## 🔒 Seguridad
- **SSL/TLS:** Conexiones seguras forzadas (HTTPS) para APIs de producción.
- **Network Config:** Configuración de seguridad de red Android ajustada para permitir depuración local (Metro) pero exigir seguridad en remoto.

## 📄 Licencia
Privada - LogixMobile
