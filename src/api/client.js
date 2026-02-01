import axios from 'axios';

// Backend VPS Address
const API_URL = 'https://149.56.99.53';

const client = axios.create({
    baseURL: API_URL,
    headers: {
        // 'Content-Type': 'application/json', // Default
    },
    // Important for handling cookies if the backend sets them
    // Note: Android might need extra config for self-signed certs if https
});

export default client;
