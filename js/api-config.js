/**
 * API Configuration
 * ใช้ PHP API เป็นหลัก
 */

const API_CONFIG = {
    // PHP API (ปัจจุบัน)
    PHP_BASE_URL: 'api',

    // Build full endpoint URL
    endpoint(path) {
        const base = this.PHP_BASE_URL;
        // Remove leading slash if present
        const cleanPath = path.startsWith('/') ? path.slice(1) : path;
        return `${base}/${cleanPath}`;
    },

    // Get current base URL
    getBaseUrl() {
        return this.PHP_BASE_URL;
    }
};

// Make it globally available
window.API_CONFIG = API_CONFIG;

console.log('📡 API Mode: PHP (Standard)');
