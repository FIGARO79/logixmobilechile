import axios from 'axios';

// Backend VPS Address (usando dominio con certificado SSL válido)
const API_URL = 'https://logixapp.dev';

const client = axios.create({
    baseURL: 'https://logixapp.dev',
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

// Request Interceptor: Log all outgoing requests
client.interceptors.request.use(
    (config) => {
        console.log(`[API Request] ${config.method.toUpperCase()} ${config.url}`, config.data || '');
        return config;
    },
    (error) => {
        console.error('[API Request Error]', error);
        return Promise.reject(error);
    }
);

// Response Interceptor: Log all incoming responses
client.interceptors.response.use(
    (response) => {
        console.log(`[API Response] ${response.status} ${response.config.url}`, response.data);
        return response;
    },
    (error) => {
        console.error(`[API Response Error] ${error.response?.status || 'Network'} ${error.config?.url}`,
            error.response?.data || error.message);
        return Promise.reject(error);
    }
);
// Important for handling cookies if the backend sets them
// Note: Android might need extra config for self-signed certs if https

export default client;
