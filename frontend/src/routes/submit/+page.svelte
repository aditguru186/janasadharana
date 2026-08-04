<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth.js';
	import { GrievanceAPI, MetaAPI, LABELS } from '$lib/api.js';

	const CATEGORIES = Object.keys(LABELS.categories);

	let title = '';
	let description = '';
	let category = 'water';
	let wardId = '';
	let wards = [];
	let lat = null;
	let lng = null;
	let locationLabel = 'Not set';
	let locating = false;
	let error = '';
	let success = '';
	let trackingCode = '';
	let submitting = false;
	let dynamicKeys = [''];
	let dynamicValues = [''];

	onMount(async () => {
		if (!$auth.accessToken) {
			goto('/login');
			return;
		}
		try {
			const res = await MetaAPI.wards();
			wards = res.data;
		} catch {
			/* optional */
		}
	});

	function addAttribute() {
		dynamicKeys = [...dynamicKeys, ''];
		dynamicValues = [...dynamicValues, ''];
	}

	async function captureLocation() {
		error = '';
		locating = true;
		try {
			const position = await new Promise((resolve, reject) => {
				if (!navigator.geolocation) {
					reject(new Error('Geolocation is not supported by this browser.'));
					return;
				}
				navigator.geolocation.getCurrentPosition(resolve, reject, {
					enableHighAccuracy: true,
					timeout: 15000
				});
			});
			lat = position.coords.latitude;
			lng = position.coords.longitude;
			locationLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
		} catch (e) {
			error =
				e.code === 1
					? 'Location permission denied. Enable GPS to submit within Puri Municipality.'
					: e.message || 'Unable to get location.';
		}
		locating = false;
	}

	/** Dev/demo: pin near Puri centre if GPS unavailable on desktop */
	function usePuriCentre() {
		lat = 19.8134;
		lng = 85.8245;
		locationLabel = `${lat}, ${lng} (Puri centre — demo)`;
	}

	async function handleSubmit() {
		error = '';
		success = '';
		if (lat == null || lng == null) {
			error = 'Please capture your location before submitting.';
			return;
		}
		submitting = true;
		try {
			const extraDetails = dynamicKeys
				.map((k, i) => ({ key: k, value: dynamicValues[i] }))
				.filter((e) => e.key && e.value);

			const res = await GrievanceAPI.create({
				title,
				description,
				category,
				wardId: wardId || undefined,
				location: { type: 'Point', coordinates: [lng, lat] },
				extraDetails
			});

			trackingCode = res.data.trackingCode;
			success = `Submitted. Your tracking code is ${trackingCode}`;
			title = '';
			description = '';
			dynamicKeys = [''];
			dynamicValues = [''];
		} catch (e) {
			error = e.message;
		}
		submitting = false;
	}
</script>

<div class="glass-panel form-panel">
	<h2>Submit a grievance</h2>
	<p class="subtitle">Must be located inside Puri Municipality (≈20 km of city centre).</p>

	{#if error}
		<div class="alert alert-error">{error}</div>
	{/if}
	{#if success}
		<div class="alert alert-success">
			{success}
			{#if trackingCode}
				<div style="margin-top: 8px;">
					<a href="/track?code={trackingCode}" style="color: #6ee7b7; text-decoration: underline;">
						Track status
					</a>
					·
					<a href="/my" style="color: #6ee7b7; text-decoration: underline;">My tickets</a>
				</div>
			{/if}
		</div>
	{/if}

	<form on:submit|preventDefault={handleSubmit}>
		<label class="field-label" for="title">Title</label>
		<input id="title" class="input-field" bind:value={title} required minlength="3" maxlength="200" />

		<label class="field-label" for="description">Description</label>
		<textarea
			id="description"
			class="textarea-field"
			bind:value={description}
			required
			minlength="10"
			rows="4"
		></textarea>

		<label class="field-label" for="category">Category</label>
		<select id="category" class="select-field" bind:value={category}>
			{#each CATEGORIES as c}
				<option value={c}>{LABELS.categories[c]}</option>
			{/each}
		</select>

		<label class="field-label" for="ward">Ward (optional)</label>
		<select id="ward" class="select-field" bind:value={wardId}>
			<option value="">Select ward</option>
			{#each wards as w}
				<option value={w.id}>{w.name}</option>
			{/each}
		</select>

		<span class="field-label" id="location-label">Location</span>
		<div class="location-box" role="group" aria-labelledby="location-label">
			<span class="muted">{locationLabel}</span>
			<button type="button" class="btn btn-sm btn-primary" on:click={captureLocation} disabled={locating}>
				{locating ? 'Locating…' : 'Use my GPS'}
			</button>
			<button type="button" class="btn btn-sm btn-ghost" on:click={usePuriCentre}>
				Use Puri centre (demo)
			</button>
		</div>

		<div style="margin: 8px 0 16px;">
			<p class="muted" style="margin-bottom: 10px;">Additional details (optional)</p>
			{#each dynamicKeys as _, i}
				<div style="display: flex; gap: 10px; margin-bottom: 10px;">
					<input class="input-field" style="margin: 0;" bind:value={dynamicKeys[i]} placeholder="e.g. Landmark" />
					<input class="input-field" style="margin: 0;" bind:value={dynamicValues[i]} placeholder="Value" />
				</div>
			{/each}
			<button type="button" class="btn btn-ghost" style="width: 100%;" on:click={addAttribute}>
				+ Add detail
			</button>
		</div>

		<button type="submit" class="btn btn-primary" style="width: 100%; padding: 14px;" disabled={submitting}>
			{submitting ? 'Submitting…' : 'Submit grievance'}
		</button>
	</form>
</div>
