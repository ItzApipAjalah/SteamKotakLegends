import { defineConfig } from 'vite';
import * as dotenv from 'dotenv';

// Load .env file at build time
dotenv.config();

// https://vitejs.dev/config
export default defineConfig({
    define: {
        // Inject environment variables at build time
        'process.env.COOKIE_API_URL': JSON.stringify(process.env.COOKIE_API_URL || ''),
        'process.env.COOKIE_API_TOKEN': JSON.stringify(process.env.COOKIE_API_TOKEN || ''),
    },
});
