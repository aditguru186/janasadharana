import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({ out: 'build' }),
		// Absolute /_app URLs. Relative paths make /cow, /login, /admin
		// request /cow/_app/... and 404 (SvelteKit 2 default).
		paths: { relative: false }
	}
};

export default config;
