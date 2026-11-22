import axios, {
    AxiosError,
    AxiosHeaders,
    AxiosResponse,
    InternalAxiosRequestConfig,
} from 'axios';
import axiosRetry from 'axios-retry';
import { queueRequest } from '../utils/syncManager';
import eventEmitter, { EVENTS } from '../utils/events';

// Backend VPS Address
const API_URL = 'https://logixapp.dev';

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);
let csrfToken: string | null = null;
let csrfPromise: Promise<string | null> | null = null;

interface CsrfRequestConfig extends InternalAxiosRequestConfig {
    _csrfRetried?: boolean;
}

type HeadersLike =
    | AxiosHeaders
    | Record<string, unknown>
    | { get?: (name: string) => unknown; 'set-cookie'?: unknown };

function setHeader(
    config: InternalAxiosRequestConfig,
    name: string,
    value: string
): void {
    if (!config.headers) {
        config.headers = new AxiosHeaders();
    }
    if (typeof config.headers.set === 'function') {
        config.headers.set(name, value);
    } else {
        (config.headers as Record<string, string>)[name] = value;
    }
}

function extractCsrfTokenFromHeaders(headers: HeadersLike | undefined): string | null {
    if (!headers) {
        return null;
    }
    const rawSetCookie =
        typeof (headers as { get?: (name: string) => unknown }).get === 'function'
            ? (headers as { get: (name: string) => unknown }).get('set-cookie')
            : (headers as Record<string, unknown>)['set-cookie'];

    if (!rawSetCookie) {
        return null;
    }

    const cookies = Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie];
    for (const cookieStr of cookies) {
        if (typeof cookieStr !== 'string') {
            continue;
        }
        const match = cookieStr.match(/(?:^|,\s*|;\s*)csrf_token=([^;]+)/);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

function updateCsrfTokenFromResponse(
    response: AxiosResponse | undefined
): string | null {
    if (!response) {
        return null;
    }
    const data = response.data as { csrf_token?: unknown } | undefined;
    const tokenFromBody =
        data && typeof data.csrf_token === 'string' ? data.csrf_token : null;
    const tokenFromHeader = extractCsrfTokenFromHeaders(
        response.headers as HeadersLike
    );
    const nextToken = tokenFromBody || tokenFromHeader;
    if (nextToken) {
        csrfToken = nextToken;
    }
    return nextToken;
}

async function ensureCsrfToken(forceRefresh = false): Promise<string | null> {
    if (csrfToken && !forceRefresh) {
        return csrfToken;
    }
    if (csrfPromise && !forceRefresh) {
        return csrfPromise;
    }

    csrfPromise = axios
        .get(`${API_URL}/api/csrf`, {
            withCredentials: true,
            timeout: 10000,
            headers: {
                Accept: 'application/json',
            },
        })
        .then((res) => updateCsrfTokenFromResponse(res) || csrfToken)
        .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.warn('[CSRF] No se pudo obtener el token CSRF:', message);
            return csrfToken;
        })
        .finally(() => {
            csrfPromise = null;
        });

    return csrfPromise;
}

const client = axios.create({
    baseURL: API_URL,
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    },
    withCredentials: true,
    timeout: 15000, // 15 segundos de timeout
});

// Configurar Reintentos Automáticos
axiosRetry(client, {
    retries: 3, // Reintentar hasta 3 veces
    retryDelay: (retryCount) => {
        console.log(`[API Retry] Intento ${retryCount}...`);
        return retryCount * 2000; // 2s, 4s, 6s
    },
    retryCondition: (error) => {
        // Reintentar solo si es error de red o error 5xx del servidor
        return (
            axiosRetry.isNetworkOrIdempotentRequestError(error) ||
            Boolean(error.response && error.response.status >= 500) ||
            error.code === 'ECONNABORTED' // Incluir reintento por timeout
        );
    },
});

// Request Interceptor
client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
        const method = (config.method || 'get').toLowerCase();
        console.log(`[API Request] ${method.toUpperCase()} ${config.url}`);

        if (MUTATING_METHODS.has(method)) {
            const token = csrfToken || (await ensureCsrfToken());
            if (token) {
                setHeader(config, 'X-CSRF-Token', token);
            }
        }

        return config;
    },
    (error: AxiosError) => {
        return Promise.reject(error);
    }
);

// Response Interceptor
client.interceptors.response.use(
    (response: AxiosResponse) => {
        updateCsrfTokenFromResponse(response);
        return response;
    },
    async (error: AxiosError) => {
        const config = error.config as CsrfRequestConfig | undefined;

        if (!error.response) {
            // Error de red (sin respuesta del servidor)
            if (error.code === 'ECONNABORTED') {
                console.error('[Network Error] Tiempo de espera agotado (Timeout).');
            } else {
                console.error(`[Network Error] Sin respuesta del servidor: ${error.message}`);
            }

            // --- Lógica de Sincronización Offline Automática ---
            // Solo encolamos si:
            // 1. Es un error de red puro (no hay respuesta).
            // 2. El método NO es GET (no encolamos consultas de datos).
            // 3. NO es una petición de login o logout (seguridad/sesión).
            const url = config?.url || '';
            const method = (config?.method || 'get').toLowerCase();
            const isSafeToQueue =
                Boolean(config) &&
                method !== 'get' &&
                !url.includes('/api/login') &&
                !url.includes('/api/logout');

            if (isSafeToQueue && config) {
                console.log(
                    `[Offline Sync] Encolando petición fallida: ${method.toUpperCase()} ${url}`
                );
                await queueRequest(url, method, config.data);
                eventEmitter.emit(EVENTS.SYNC_NEEDED);
            }
            // ---------------------------------------------------
        } else {
            updateCsrfTokenFromResponse(error.response);

            const method = (config?.method || 'get').toLowerCase();
            const isCsrfError =
                error.response.status === 403 &&
                MUTATING_METHODS.has(method) &&
                Boolean(config) &&
                !config?._csrfRetried &&
                JSON.stringify(error.response.data || '')
                    .toLowerCase()
                    .includes('csrf');

            if (isCsrfError && config) {
                config._csrfRetried = true;
                csrfToken = null;
                const freshToken = await ensureCsrfToken(true);
                if (freshToken) {
                    setHeader(config, 'X-CSRF-Token', freshToken);
                    return client(config);
                }
            }

            console.error(
                `[API Error] ${error.response.status}: ${JSON.stringify(error.response.data)}`
            );
        }
        return Promise.reject(error);
    }
);

export default client;
