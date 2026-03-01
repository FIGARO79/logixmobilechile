# Estrategia de Implementación: Slotting Inteligente - LogixMobile

Este documento detalla la lógica actual y el plan maestro para la evolución del sistema de ubicación de inventarios (Slotting).

## 1. Fase Actual: Slotting Estático (Implementado)
Actualmente, el sistema utiliza un modelo de **Ubicación Fija/Maestra**.
- **Lógica:** Al escanear un SKU en Inbound, el sistema recupera el `binLocation` (ubicación última conocida).
- **Interacción:** Se muestra una sugerencia visual en pantalla. El operario puede confirmarla con un "tap" para autocompletar el campo `relocatedBin`.
- **Objetivo:** Reducir errores de transcripción y guiar al operario hacia la posición habitual del producto.

---

## 2. Fase Futura: Slotting Dinámico e Inteligente
Para evolucionar a una sugerencia basada en disponibilidad real y optimización de espacios, se requieren los siguientes pilares:

### A. Mapa de Ubicaciones (Layout del Almacén)
Se debe diseñar una tabla de `Bins` (Ubicaciones) con los siguientes atributos:
- **ID / Código de Bin:** (Ej: A-01-02-C).
- **Coordenadas:** (X, Y, Z) para calcular proximidad a las puertas de despacho.
- **Tipo de Ubicación:** (Rack, Piso, Picking, Reserva).
- **Dimensiones/Capacidad:** (M3, Peso máximo o Cantidad máxima de unidades estándar).
- **Estatus:** (Vacío, Parcialmente Lleno, Lleno, Bloqueado).

### B. Algoritmo de Sugerencia (Backend)
El endpoint `/api/suggest_bin` deberá evaluar los siguientes criterios en orden de prioridad:
1.  **Consolidación:** ¿Hay espacio en el bin donde ya existe el mismo SKU?
2.  **Clasificación ABC:** 
    - **A (Alta rotación):** Ubicaciones a nivel de piso y cerca de la salida.
    - **B (Media):** Ubicaciones en niveles medios o pasillos centrales.
    - **C (Baja):** Niveles altos (requiere montacargas) o zonas alejadas.
3.  **Proximidad:** Sugerir el hueco vacío más cercano al punto de recepción actual.
4.  **Reglas de Compatibilidad:** Evitar mezclar ciertos tipos de productos en el mismo bin (ej: químicos vs alimentos).

---

## 3. Requerimientos Técnicos para la Integración
Para que la App pueda consumir estas sugerencias, el flujo será:
1.  `GET /api/find_item/{sku}` -> Devuelve datos del ítem + `suggestedBin` (calculado dinámicamente).
2.  Si el operario rechaza la sugerencia (escribe un bin distinto), la App enviará un `POST` para actualizar el estatus de la nueva ubicación.

---

## 4. Próximos Pasos Sugeridos
1.  **Levantamiento de Inventario de Ubicaciones:** Documentar todos los bins del almacén en un Excel/CSV para su carga masiva.
2.  **Definición de Capacidades:** Establecer cuántas unidades de los SKUs más comunes caben en un bin estándar.
3.  **Desarrollo del Mapa de Calor:** Una vez implementado, se podrá visualizar qué zonas del almacén están saturadas.
