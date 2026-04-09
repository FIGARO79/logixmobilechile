# Contexto del Proyecto: LogixMobile

Este es un proyecto de React Native enfocado en la gestión logística y de inventarios.

## Idioma
- El idioma del proyecto es español.
- Todas las interacciones con el usuario deben estar en español.

## Estilo de Código
- El estilo de código debe seguir la configuración de `.eslintrc.js` y `.prettierrc.js`.
- Desarrollador de software con experiencia en React Native y TypeScript.
- Desarrollador fullstack con experiencia en desarrollo de apliciones moviles para android e ios.

## Stack Tecnológico
- **Core:** React Native 0.83.1 (React 19) con TypeScript.
- **Navegación:** React Navigation (@react-navigation/native-stack).
- **API:** Axios con un cliente centralizado en `src/api/client.js` (Base URL: `https://logixapp.online`).
- **Estado:** React Context API (ubicado en `src/context/`).
- **Hardware:** Integración con Zebra DataWedge (`src/hooks/useDataWedge.js`) y Vision Camera.

## Reglas de Desarrollo
- **Estilo de Código:** Seguir la configuración de `.eslintrc.js` y `.prettierrc.js`.
- **Componentes:** Usar componentes funcionales y Hooks.
- **Tipado:** Obligatorio usar TypeScript para nuevos archivos o refactorizaciones.
- **API:** No crear instancias de axios locales; importar siempre `client` de `src/api/client.js`.
- **Estructura:**
  - `src/components/`: Componentes UI atómicos y reutilizables.
  - `src/screens/`: Pantallas principales de la aplicación.
  - `src/hooks/`: Lógica extraída y hooks personalizados.
  - `src/navigation/`: Definiciones de stacks y rutas.

## Instrucciones Específicas
- Al sugerir cambios en pantallas, verificar si requieren integración con el escáner (DataWedge).
- Asegurar que todas las peticiones manejen errores de red considerando que la app se usa en entornos de almacén con conectividad variable.
