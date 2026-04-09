import axios from 'axios';
import axiosRetry from 'axios-retry';

// Backend VPS Address
const API_URL = 'https://logixapp.online';

const client = axios.create({
    baseURL: API_URL,
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    },
    withCredentials: true,
    timeout: 10000, // 10 segundos de timeout
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
        return axiosRetry.isNetworkOrIdempotentRequestError(error) || 
               (error.response && error.response.status >= 500);
    },
});

// Request Interceptor
client.interceptors.request.use(
    (config) => {
        console.log(`[API Request] ${config.method.toUpperCase()} ${config.url}`);
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response Interceptor
client.interceptors.response.use(
    (response) => {
        return response;
    },
    (error) => {
        if (!error.response) {
            console.error('[Network Error] Verifica tu conexión a internet.');
        }
        return Promise.reject(error);
    }
);

export default client;
