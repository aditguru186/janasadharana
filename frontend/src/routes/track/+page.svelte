<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { GrievanceAPI, CowConcernAPI, LABELS } from '$lib/api.js';

	let code = '';
	let result = null;
	let history = [];
	let error = '';
	let loading = false;
	let isCow = false;

	onMount(() => {
		const q = $page.url.searchParams.get('code');
		if (q) {
			code = q;
			lookup();
		}
	});

	async function lookup() {
		error = '';
		result = null;
		history = [];
		isCow = false;
		if (!code.trim()) {
			error = 'Enter a tracking code (e.g. PUR-XXXXXXXX).';
			return;
		}
		loading = true;
		const raw = code.trim();
		try {
			try {
				const res = await CowConcernAPI.track(raw);
				const d = res.data;
				isCow = true;
				result = {
					id: d.id,
					trackingCode: d.trackingCode,
					title: (d.concernText || 'Cow welfare concern').slice(0, 100),
					description: d.concernText,
					category: 'cow_welfare',
					status: d.status,
					concernType: d.concernType,
					voiceId: d.voiceId,
					images: d.images || [],
					assignedTo: d.assignedTo,
					createdAt: d.createdAt || d.date,
					location: d.location
				};
				try {
					const h = await fetchHistory(d.id);
					history = h;
				} catch {
					history = [];
				}
			} catch {
				const res = await GrievanceAPI.track(raw);
				result = res.data;
				const h = await GrievanceAPI.history(result.id);
				history = h.data;
			}
		} catch (e) {
			error = e.message;
		}
		loading = false;
	}

	async function fetchHistory(id) {
		const { getApiBase } = await import('$lib/api.js');
		const res = await fetch(`${getApiBase()}/cow-concerns/${id}/history`);
		const body = await res.json();
		if (!res.ok) return [];
		return (body.data || []).map((h) => ({
			toStatus: h.toStatus,
			note: h.note,
			createdAt: h.createdAt,
			changedByName: h.changedByName
		}));
	}
</script>

<div class="glass-panel form-panel">
	<h2>Track concern</h2>
	<p class="subtitle">Enter the tracking code (PUR-…). Works for civic grievances and cow welfare.</p>

	{#if error}
		<div class="alert alert-error">{error}</div>
	{/if}

	<form on:submit|preventDefault={lookup}>
		<label class="field-label" for="code">Tracking code</label>
		<input
			id="code"
			class="input-field"
			bind:value={code}
			placeholder="PUR-XXXXXXXX"
			style="text-transform: uppercase;"
		/>
		<button type="submit" class="btn btn-primary" style="width: 100%;" disabled={loading}>
			{loading ? 'Searching…' : 'Track'}
		</button>
	</form>

	{#if result}
		<div style="margin-top: 28px;">
			<div class="card-meta" style="margin-bottom: 12px;">
				<h3>{result.title}</h3>
				<span class="badge badge-{result.status}">{LABELS.statuses[result.status]}</span>
			</div>
			<p class="muted" style="margin-bottom: 12px;">{result.description}</p>
			<div class="detail-row">
				<span>Code</span><span>{result.trackingCode}</span>
			</div>
			<div class="detail-row">
				<span>Category</span>
				<span>{isCow ? 'Cow Welfare' : LABELS.categories[result.category] || result.category}</span>
			</div>
			{#if isCow && result.concernType}
				<div class="detail-row">
					<span>Type</span><span>{result.concernType}</span>
				</div>
			{/if}
			{#if isCow && result.assignedTo}
				<div class="detail-row">
					<span>Assigned to</span><span>{result.assignedTo.fullName}</span>
				</div>
			{/if}
			{#if isCow && result.images?.length}
				<div class="media-gallery" style="margin-top: 12px;">
					{#each result.images as img}
						{#if img.url}
							<img src={img.url} alt="Evidence" />
						{/if}
					{/each}
				</div>
			{/if}
			{#if isCow && result.voiceId?.url}
				<audio controls src={result.voiceId.url} style="width:100%;margin-top:10px;"></audio>
			{/if}

			{#if history.length}
				<h3 style="margin: 22px 0 12px; font-size: 1rem;">Timeline</h3>
				<ul class="timeline">
					{#each history as h}
						<li>
							<strong>{LABELS.statuses[h.toStatus] || h.toStatus}</strong>
							{#if h.note}<span class="muted"> — {h.note}</span>{/if}
							<div class="muted" style="font-size: 0.8rem;">
								{new Date(h.createdAt).toLocaleString()}
								{#if h.changedByName} · {h.changedByName}{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>
