import axios from 'axios';

// Backend VPS Address (usando dominio con certificado SSL válido)
const API_URL = 'https://logixapp.dev';

const client = axios.create({
    baseURL: API_URL,
    headers: {
        // 'Content-Type': 'application/json', // Default
    },
    // Important for handling cookies if the backend sets them
    // Note: Android might need extra config for self-signed certs if https
});

export default client;
