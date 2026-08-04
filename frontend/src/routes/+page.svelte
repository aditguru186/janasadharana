<script>
	import { onMount } from 'svelte';
	import { GrievanceAPI, LABELS } from '$lib/api.js';
	import { auth } from '$lib/auth.js';
	import { t } from '$lib/i18n.js';

	let grievances = [];
	let meta = { total: 0, page: 1, totalPages: 1 };
	let loading = true;
	let error = '';
	let category = '';
	let status = '';
	let page = 1;

	const CATEGORIES = Object.keys(LABELS.categories);
	const STATUSES = Object.keys(LABELS.statuses);

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await GrievanceAPI.list({
				category: category || undefined,
				status: status || undefined,
				page,
				limit: 12
			});
			grievances = res.data;
			meta = res.meta;
		} catch (e) {
			error = e.message;
		}
		loading = false;
	}

	onMount(load);

	function setCategory(c) {
		category = category === c ? '' : c;
		page = 1;
		load();
	}

	function setStatus(s) {
		status = status === s ? '' : s;
		page = 1;
		load();
	}

	async function toggleUpvote(g) {
		if (!$auth.accessToken) {
			error = 'Please log in to upvote.';
			return;
		}
		try {
			if (g.hasUpvoted) {
				const res = await GrievanceAPI.removeUpvote(g.id);
				g.upvoteCount = res.data.upvoteCount;
				g.hasUpvoted = false;
			} else {
				const res = await GrievanceAPI.upvote(g.id);
				g.upvoteCount = res.data.upvoteCount;
				g.hasUpvoted = true;
			}
			grievances = grievances;
		} catch (e) {
			error = e.message;
		}
	}
</script>

<section>
	<a href="/cow" class="cow-banner glass-panel">
		<div>
			<strong>{$t('cowBannerTitle')}</strong>
			<p>{$t('cowBannerBody')}</p>
		</div>
		<span class="btn btn-sm cow-banner-cta">{$t('cowBannerCta')}</span>
	</a>

	<h2 class="page-title">{$t('homeTitle')}</h2>
	<p class="page-sub">
		{$t('homeSub')}
	</p>

	{#if !$auth.user}
		<div class="alert alert-info">
			New here? <a href="/register" style="color: #93c5fd; text-decoration: underline;">Create an account</a>
			to submit grievances, or
			<a href="/track" style="color: #93c5fd; text-decoration: underline;">track by code</a>.
			No account needed for
			<a href="/cow" style="color: #fcd34d; text-decoration: underline;">cow welfare reports</a>.
		</div>
	{/if}

	{#if error}
		<div class="alert alert-error">{error}</div>
	{/if}

	<div class="filters">
		<span class="muted" style="align-self: center;">Category:</span>
		{#each CATEGORIES as c}
			<button
				type="button"
				class="btn btn-sm {category === c ? 'active' : ''}"
				class:active={category === c}
				on:click={() => setCategory(c)}
			>
				{LABELS.categories[c]}
			</button>
		{/each}
	</div>

	<div class="filters">
		<span class="muted" style="align-self: center;">Status:</span>
		{#each STATUSES as s}
			<button
				type="button"
				class="btn btn-sm {status === s ? 'active' : ''}"
				class:active={status === s}
				on:click={() => setStatus(s)}
			>
				{LABELS.statuses[s]}
			</button>
		{/each}
	</div>

	{#if loading}
		<div class="empty-state">Loading grievances…</div>
	{:else if grievances.length === 0}
		<div class="empty-state glass-panel">No grievances match these filters.</div>
	{:else}
		<div class="card-list">
			{#each grievances as g (g.id)}
				<article class="glass-panel grievance-card">
					<div class="card-meta" style="margin-bottom: 8px;">
						<a href="/grievance/{g.id}"><h3>{g.title}</h3></a>
						<span class="badge badge-{g.status}">{LABELS.statuses[g.status]}</span>
					</div>
					<p>{g.description}</p>
					<div class="card-meta">
						<div class="card-meta-left">
							<span class="badge">{LABELS.categories[g.category]}</span>
							<span class="muted">{g.trackingCode}</span>
							{#if g.ward}
								<span class="muted">{g.ward.name}</span>
							{/if}
						</div>
						<div class="card-meta-left">
							<button type="button" class="btn btn-sm" on:click={() => toggleUpvote(g)}>
								{g.hasUpvoted ? '★' : '☆'} {g.upvoteCount}
							</button>
							<a href="/grievance/{g.id}" class="btn btn-sm btn-ghost">Details</a>
						</div>
					</div>
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
				}}
			>
				← Prev
			</button>
			<span class="muted">Page {meta.page} of {meta.totalPages} · {meta.total} total</span>
			<button
				type="button"
				class="btn btn-sm"
				disabled={page >= meta.totalPages}
				on:click={() => {
					page += 1;
					load();
				}}
			>
				Next →
			</button>
		</div>
	{/if}
</section>
