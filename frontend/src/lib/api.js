import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { get } from 'svelte/store';
import { auth, clearAuth, setTokens } from './auth.js';

function getApiBase() {
	const base = env.PUBLIC_API_URL || 'http://localhost:5430/api/v1';
	return base.replace(/\/$/, '');
}

export { getApiBase };

async function parseJson(res) {
	try {
		return await res.json();
	} catch {
		return null;
	}
}

async function refreshAccessToken() {
	const { refreshToken } = get(auth);
	if (!refreshToken) return false;

	const res = await fetch(`${getApiBase()}/auth/refresh`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ refreshToken })
	});

	const body = await parseJson(res);
	if (!res.ok) {
		clearAuth();
		return false;
	}

	setTokens(body.data);
	return true;
}

/**
 * Shared HTTP client for Web (and the same contract for iOS/Android).
 * Auth: Authorization: Bearer <accessToken>
 * Refresh: POST /auth/refresh { refreshToken }
 */
export async function api(path, options = {}) {
	const { auth: needsAuth = false, method = 'GET', body, headers = {}, retry = true } = options;
	const h = { ...headers };
	const state = get(auth);

	if (body !== undefined) {
		h['Content-Type'] = 'application/json';
	}
	if (state.accessToken) {
		h.Authorization = `Bearer ${state.accessToken}`;
	} else if (needsAuth) {
		throw new Error('Please log in to continue.');
	}

	const res = await fetch(`${getApiBase()}${path}`, {
		method,
		headers: h,
		body: body !== undefined ? JSON.stringify(body) : undefined
	});

	if (res.status === 401 && retry && browser && state.refreshToken) {
		const ok = await refreshAccessToken();
		if (ok) return api(path, { ...options, retry: false });
	}

	const data = await parseJson(res);
	if (!res.ok) {
		const msg = data?.error || `Request failed (${res.status})`;
		const err = new Error(msg);
		err.status = res.status;
		err.details = data?.details;
		throw err;
	}
	return data;
}

export const AuthAPI = {
	register: (payload) => api('/auth/register', { method: 'POST', body: payload }),
	login: (payload) => api('/auth/login', { method: 'POST', body: payload }),
	logout: async () => {
		const { refreshToken } = get(auth);
		try {
			await api('/auth/logout', { method: 'POST', body: { refreshToken } });
		} catch {
			/* ignore network errors on logout */
		}
		clearAuth();
	},
	me: () => api('/auth/me', { auth: true })
};

export const MetaAPI = {
	get: () => api('/meta'),
	wards: () => api('/wards')
};

/** Dedicated cow welfare concerns (R2 media + agents) */
export const CowConcernAPI = {
	create: (payload) => api('/cow-concerns', { method: 'POST', body: payload }),
	meta: () => api('/cow-concerns/meta'),
	track: (code) => api(`/cow-concerns/track/${encodeURIComponent(code)}`),
	get: (id) => api(`/cow-concerns/${id}`),
	list: (params = {}) => {
		const qs = new URLSearchParams();
		Object.entries(params).forEach(([k, v]) => {
			if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
		});
		const q = qs.toString();
		return api(`/cow-concerns${q ? `?${q}` : ''}`, { auth: true });
	},
	updateStatus: (id, status, note) =>
		api(`/cow-concerns/${id}/status`, {
			method: 'PATCH',
			body: { status, note },
			auth: true
		}),
	assign: (id, agentId) =>
		api(`/cow-concerns/${id}/assign`, {
			method: 'POST',
			body: { agentId },
			auth: true
		})
};

export const AgentsAPI = {
	list: (availableOnly = false) =>
		api(`/agents${availableOnly ? '?availableOnly=true' : ''}`, { auth: true }),
	availableCount: () => api('/agents/available-count'),
	create: (payload) => api('/agents', { method: 'POST', body: payload, auth: true }),
	update: (id, payload) => api(`/agents/${id}`, { method: 'PATCH', body: payload, auth: true })
};

export const GrievanceAPI = {
	list: (params = {}) => {
		const qs = new URLSearchParams();
		Object.entries(params).forEach(([k, v]) => {
			if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
		});
		const q = qs.toString();
		return api(`/grievances${q ? `?${q}` : ''}`);
	},
	mine: (params = {}) => {
		const qs = new URLSearchParams();
		Object.entries(params).forEach(([k, v]) => {
			if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
		});
		const q = qs.toString();
		return api(`/grievances/mine${q ? `?${q}` : ''}`, { auth: true });
	},
	get: (id) => api(`/grievances/${id}`),
	track: (code) => api(`/grievances/track/${encodeURIComponent(code)}`),
	history: (id) => api(`/grievances/${id}/history`),
	create: (payload) => api('/grievances', { method: 'POST', body: payload, auth: true }),
	/** Public cow welfare report — no login required */
	reportCowWelfare: (payload) =>
		api('/grievances/cow-welfare', { method: 'POST', body: payload }),
	updateStatus: (id, status, note) =>
		api(`/grievances/${id}/status`, {
			method: 'PATCH',
			body: { status, note },
			auth: true
		}),
	assign: (id, assigneeId) =>
		api(`/grievances/${id}/assign`, {
			method: 'POST',
			body: { assigneeId },
			auth: true
		}),
	upvote: (id) => api(`/grievances/${id}/upvote`, { method: 'POST', auth: true }),
	removeUpvote: (id) => api(`/grievances/${id}/upvote`, { method: 'DELETE', auth: true }),
	nearby: (lat, lng, maxDistance = 5000) =>
		api(`/grievances/nearby?lat=${lat}&lng=${lng}&maxDistance=${maxDistance}`)
};

export const AdminAPI = {
	stats: () => api('/admin/stats', { auth: true }),
	officers: () => api('/admin/officers', { auth: true })
};

export const LABELS = {
	categories: {
		water: 'Water',
		electricity: 'Electricity',
		domestic_help: 'Domestic Help',
		sewage: 'Sewage',
		roads: 'Roads',
		sanitation: 'Sanitation',
		streetlight: 'Street Light',
		other: 'Other',
		dharta: 'Dharta',
		cow_welfare: 'Cow Welfare'
	},
	statuses: {
		open: 'Open',
		assigned: 'Assigned',
		in_progress: 'In Progress',
		resolved: 'Resolved',
		rejected: 'Rejected'
	}
};
