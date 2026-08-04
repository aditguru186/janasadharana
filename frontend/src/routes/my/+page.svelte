<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth.js';
	import { GrievanceAPI, LABELS } from '$lib/api.js';

	let items = [];
	let meta = {};
	let loading = true;
	let error = '';
	let page = 1;

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await GrievanceAPI.mine({ page, limit: 20 });
			items = res.data;
			meta = res.meta;
		} catch (e) {
			error = e.message;
		}
		loading = false;
	}

	onMount(() => {
		if (!$auth.accessToken) {
			goto('/login');
			return;
		}
		load();
	});
</script>

<section>
	<h2 class="page-title">My grievances</h2>
	<p class="page-sub">Tickets you filed with Puri Municipality.</p>

	{#if error}
		<div class="alert alert-error">{error}</div>
	{/if}

	{#if loading}
		<div class="empty-state">Loading…</div>
	{:else if items.length === 0}
		<div class="empty-state glass-panel">
			You have not submitted any grievances yet.
			<div style="margin-top: 12px;">
				<a href="/submit" class="btn btn-primary btn-sm">Submit one</a>
			</div>
		</div>
	{:else}
		<div class="card-list">
			{#each items as g (g.id)}
				<article class="glass-panel grievance-card">
					<div class="card-meta" style="margin-bottom: 8px;">
						<a href="/grievance/{g.id}"><h3>{g.title}</h3></a>
						<span class="badge badge-{g.status}">{LABELS.statuses[g.status]}</span>
					</div>
					<p class="muted">{g.trackingCode} · {LABELS.categories[g.category]} · ▲ {g.upvoteCount}</p>
				</article>
			{/each}
		</div>

		<div class="pager">
			<button
				type="button"
				class="btn btn-sm"
				disabled={page <= 1}
				on:click={() => {
					page -= 1;
					load();
				}}>← Prev</button
			>
			<span class="muted">Page {meta.page} / {meta.totalPages}</span>
			<button
				type="button"
				class="btn btn-sm"
				disabled={page >= meta.totalPages}
				on:click={() => {
					page += 1;
					load();
				}}>Next →</button
			>
		</div>
	{/if}
</section>
