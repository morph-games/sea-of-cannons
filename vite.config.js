// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		// Configuration for the development server
		watch: {
			// 1. Enable polling: This tells Vite to repeatedly check the file system
			//    at a set interval (instead of relying on system-level file watchers).
			usePolling: true,
		},
		// Optional: If you need to specify the host
		// host: true,
	},
});
