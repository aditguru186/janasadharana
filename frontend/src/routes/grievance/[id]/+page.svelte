<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { AdminAPI, GrievanceAPI, LABELS, getApiBase } from '$lib/api.js';
	import { auth } from '$lib/auth.js';

	const NEXT = {
		open: 'assigned',
		assigned: 'in_progress',
		in_progress: 'resolved'
	};

	const NEXT_LABEL = {
		open: 'Proceed further (Assign)',
		assigned: 'Proceed further (Start work)',
		in_progress: 'Proceed further (Resolve)'
	};

	let g = null;
	let history = [];
	let officers = [];
	let loading = true;
	let error = '';
	let actionMsg = '';
	let busy = false;
	let rejectNote = '';
	let showReject = false;

	$: isStaff =
		$auth.user && ($auth.user.role === 'officer' || $auth.user.role === 'admin');

	function mediaUrl(path) {
		if (!path) return '';
		if (path.startsWith('http')) return path;
		const origin = getApiBase().replace(/\/api\/v1$/, '');
		return `${origin}${path}`;
	}

	async function load() {
		loading = true;
		error = '';
		try {
			const id = $page.params.id;
			const res = await GrievanceAPI.get(id);
			g = res.data;
			const h = await GrievanceAPI.history(id);
			history = h.data || [];
			if (isStaff) {
				try {
					const o = await AdminAPI.officers();
					officers = o.data || [];
				} catch {
					officers = [];
				}
			}
		} catch (e) {
			error = e.message;
		}
		loading = false;
	}

	onMount(load);

	async function toggleUpvote() {
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
			g = g;
		} catch (e) {
			error = e.message;
		}
	}

	async function proceed() {
		if (!g || !NEXT[g.status]) return;
		busy = true;
		error = '';
		actionMsg = '';
		try {
			const next = NEXT[g.status];
			if (g.status === 'open' && !g.assigneeId && $auth.user?.id) {
				await GrievanceAPI.assign(g.id, $auth.user.id);
			} else {
				await GrievanceAPI.updateStatus(g.id, next);
			}
			actionMsg = `Moved to ${LABELS.statuses[next]}`;
			await load();
		} catch (e) {
			error = e.message;
		}
		busy = false;
	}

	async function rejectTicket() {
		if (!g) return;
		if (!confirm(`Reject ticket ${g.trackingCode}?`)) return;
		busy = true;
		error = '';
		actionMsg = '';
		try {
			await GrievanceAPI.updateStatus(
				g.id,
				'rejected',
				rejectNote.trim() || 'Rejected by staff'
			);
			actionMsg = 'Ticket rejected';
			showReject = false;
			rejectNote = '';
			await load();
		} catch (e) {
			error = e.message;
		}
		busy = false;
	}

	async function assignTo(assigneeId) {
		if (!assigneeId || !g) return;
		busy = true;
		error = '';
		actionMsg = '';
		try {
			await GrievanceAPI.assign(g.id, assigneeId);
			const who = officers.find((o) => o.id === assigneeId)?.fullName || 'staff';
			actionMsg = `Assigned to ${who}`;
			await load();
		} catch (e) {
			error = e.message;
		}
		busy = false;
	}

	function canAct() {
		return g && g.status !== 'resolved' && g.status !== 'rejected';
	}
</script>

{#if loading}
	<div class="empty-state">Loading…</div>
{:else if error && !g}
	<div class="alert alert-error">{error}</div>
{:else if g}
	<section class="detail-page">
		<p class="back-row muted">
			<a href="/admin">← Operations board</a>
			·
			<a href="/">Community board</a>
		</p>

		{#if error}
			<div class="alert alert-error">{error}</div>
		{/if}
		{#if actionMsg}
			<div class="alert alert-success">{actionMsg}</div>
		{/if}

		<div class="glass-panel detail-card">
			<div class="card-meta" style="margin-bottom: 12px;">
				<h2>{g.title}</h2>
				<span class="badge badge-{g.status}">{LABELS.statuses[g.status]}</span>
			</div>

			<p class="desc">{g.description}</p>

			<div class="detail-grid">
				<div class="detail-row"><span>Tracking</span><span class="mono">{g.trackingCode}</span></div>
				<div class="detail-row">
					<span>Category</span><span>{LABELS.categories[g.category] || g.category}</span>
				</div>
				{#if g.source}
					<div class="detail-row"><span>Source</span><span>{g.source}</span></div>
				{/if}
				<div class="detail-row">
					<span>Location</span>
					<span
						>{g.location.coordinates[1].toFixed(5)}, {g.location.coordinates[0].toFixed(5)}</span
					>
				</div>
				{#if g.citizenName}
					<div class="detail-row"><span>Reporter</span><span>{g.citizenName}</span></div>
				{/if}
				{#if g.citizenPhone}
					<div class="detail-row"><span>Contact</span><span>{g.citizenPhone}</span></div>
				{/if}
				{#if g.ward}
					<div class="detail-row"><span>Ward</span><span>{g.ward.name}</span></div>
				{/if}
				<div class="detail-row">
					<span>Assignee</span>
					<span>{g.assigneeName || '— Unassigned'}</span>
				</div>
				<div class="detail-row">
					<span>Filed</span><span>{new Date(g.createdAt).toLocaleString()}</span>
				</div>
			</div>

			{#if g.media?.length}
				<h3 class="block-title">Evidence</h3>
				<div class="media-gallery">
					{#each g.media as m}
						{#if m.type === 'image'}
							<img src={mediaUrl(m.path || m.url)} alt="Concern photo" />
						{:else if m.type === 'voice'}
							<audio controls src={mediaUrl(m.path || m.url)}></audio>
						{/if}
					{/each}
				</div>
			{/if}

			{#if g.extraDetails?.length}
				<h3 class="block-title">Extra details</h3>
				{#each g.extraDetails as d}
					<div class="detail-row"><span>{d.key}</span><span>{d.value}</span></div>
				{/each}
			{/if}

			<!-- Staff actions: proceed / reject / assign -->
			{#if isStaff && canAct()}
				<div class="staff-panel glass-panel">
					<h3 class="block-title" style="margin-top: 0">Staff actions</h3>
					<p class="muted staff-hint">Update this ticket without going back to the board.</p>

					<div class="assignee-block">
						<label for="detail-assign">Assignee</label>
						<select
							id="detail-assign"
							class="select-field"
							disabled={busy}
							value={g.assigneeId || ''}
							on:change={(e) => assignTo(e.currentTarget.value)}
						>
							<option value="">— Unassigned / choose —</option>
							{#each officers as o}
								<option value={o.id}>{o.fullName} ({o.role})</option>
							{/each}
							{#if $auth.user && !officers.some((o) => o.id === $auth.user.id)}
								<option value={$auth.user.id}>Me ({$auth.user.fullName})</option>
							{/if}
						</select>
					</div>

					<div class="staff-actions">
						{#if NEXT[g.status]}
							<button
								type="button"
								class="btn btn-primary"
								disabled={busy}
								on:click={proceed}
							>
								{NEXT_LABEL[g.status] || 'Proceed further'} →
							</button>
						{/if}
						<button
							type="button"
							class="btn btn-danger"
							disabled={busy}
							on:click={() => (showReject = !showReject)}
						>
							Reject
						</button>
					</div>

					{#if showReject}
						<div class="reject-box">
							<label for="reject-note">Rejection note (optional)</label>
							<textarea
								id="reject-note"
								class="textarea-field"
								rows="2"
								bind:value={rejectNote}
								placeholder="Reason for rejection"
							></textarea>
							<button type="button" class="btn btn-danger" disabled={busy} on:click={rejectTicket}>
								Confirm reject
							</button>
						</div>
					{/if}
				</div>
			{:else if isStaff && !canAct()}
				<div class="staff-panel muted">
					This ticket is <strong>{LABELS.statuses[g.status]}</strong> — no further action needed.
					{#if g.status === 'rejected'}
						<a href="/admin">Back to board</a> to reopen if needed.
					{/if}
				</div>
			{/if}

			<div class="public-actions">
				<button type="button" class="btn btn-primary btn-sm" on:click={toggleUpvote}>
					{g.hasUpvoted ? '★ Remove upvote' : '☆ Upvote'} ({g.upvoteCount})
				</button>
				<a href="/track?code={g.trackingCode}" class="btn btn-ghost btn-sm">Public track link</a>
				{#if g.category === 'cow_welfare'}
					<a
						class="btn btn-ghost btn-sm"
						href="https://www.google.com/maps?q={g.location.coordinates[1]},{g.location.coordinates[0]}"
						target="_blank"
						rel="noopener">Open in Maps</a
					>
				{/if}
			</div>

			{#if history.length}
				<h3 class="block-title">Timeline</h3>
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
	</section>
{/if}

<style>
	.detail-page {
		width: 100%;
		max-width: 720px;
		margin: 0 auto;
	}

	.back-row {
		margin: 0 0 12px;
		font-size: 0.88rem;
	}
	.back-row a {
		color: #93c5fd;
	}

	.detail-card {
		padding: 20px;
	}

	@media (min-width: 640px) {
		.detail-card {
			padding: 28px;
		}
	}

	.desc {
		margin-bottom: 18px;
		color: var(--text-muted);
		line-height: 1.5;
		word-break: break-word;
	}

	.block-title {
		margin: 22px 0 10px;
		font-size: 1rem;
	}

	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.85rem;
	}

	.staff-panel {
		margin-top: 22px;
		padding: 16px;
		border-color: rgba(59, 130, 246, 0.35);
		background: rgba(59, 130, 246, 0.08);
	}

	.staff-hint {
		margin: 0 0 12px;
		font-size: 0.85rem;
	}

	.assignee-block {
		margin-bottom: 12px;
	}
	.assignee-block label {
		display: block;
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin-bottom: 6px;
	}
	.assignee-block .select-field {
		min-height: 48px;
		width: 100%;
	}

	.staff-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}
	.staff-actions .btn {
		min-height: 48px;
		flex: 1 1 auto;
		font-size: 0.92rem;
	}

	.reject-box {
		margin-top: 12px;
		display: grid;
		gap: 8px;
		padding: 12px;
		border-radius: 10px;
		border: 1px dashed rgba(239, 68, 68, 0.4);
		background: rgba(239, 68, 68, 0.08);
	}
	.reject-box label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.public-actions {
		margin-top: 18px;
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}
	.public-actions .btn {
		min-height: 44px;
	}

	@media (max-width: 480px) {
		.staff-actions .btn {
			flex: 1 1 100%;
		}
		.public-actions .btn {
			flex: 1 1 100%;
		}
		.card-meta {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
