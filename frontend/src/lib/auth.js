import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'janasadharana_auth';

function load() {
	if (!browser) return empty();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return empty();
		return { ...empty(), ...JSON.parse(raw) };
	} catch {
		return empty();
	}
}

function empty() {
	return {
		accessToken: null,
		refreshToken: null,
		user: null
	};
}

function persist(state) {
	if (!browser) return;
	if (!state.accessToken) {
		localStorage.removeItem(STORAGE_KEY);
		return;
	}
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({
			accessToken: state.accessToken,
			refreshToken: state.refreshToken,
			user: state.user
		})
	);
}

function createAuthStore() {
	const { subscribe, set, update } = writable(load());

	return {
		subscribe,
		setSession(data) {
			const next = {
				accessToken: data.accessToken,
				refreshToken: data.refreshToken,
				user: data.user
			};
			persist(next);
			set(next);
		},
		setTokens(data) {
			update((s) => {
				const next = {
					accessToken: data.accessToken,
					refreshToken: data.refreshToken,
					user: data.user || s.user
				};
				persist(next);
				return next;
			});
		},
		clear() {
			persist(empty());
			set(empty());
		},
		isStaff(user) {
			return user && (user.role === 'officer' || user.role === 'admin');
		}
	};
}

export const auth = createAuthStore();

export function setTokens(data) {
	auth.setTokens(data);
}

export function clearAuth() {
	auth.clear();
}

export function setSession(data) {
	auth.setSession(data);
}
