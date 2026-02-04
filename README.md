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
1. **Iniciar Metro Bundler:**
   ```bash
   npm start
   ```
2. **Instalar en Android:**
   ```bash
   npm run android
   # o
   cd android && ./gradlew installDebug
   ```

---

## 🚀 Generar APK de Producción (Release)

El proyecto está configurado para generar APKs firmados automáticamente.

1. **Generar el APK:**
   ```bash
   cd android && ./gradlew assembleRelease
   ```
2. **Ubicación del archivo:**
   El APK generado se llamará `LogixMobile.apk` y se encontrará en:
   `android/app/build/outputs/apk/release/LogixMobile.apk`

---

## 🔒 Seguridad
- **SSL/TLS:** Conexiones seguras forzadas (HTTPS) para APIs de producción.
- **Network Config:** Configuración de seguridad de red Android ajustada para permitir depuración local (Metro) pero exigir seguridad en remoto.

## 📄 Licencia
Privada - LogixMobile
