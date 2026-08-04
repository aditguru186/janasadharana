import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5431,
		host: '0.0.0.0',
		strictPort: true
	},
	preview: {
		port: 5431,
		host: '0.0.0.0'
	}
});
