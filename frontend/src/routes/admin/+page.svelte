<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/auth.js';
	import { AdminAPI, GrievanceAPI, LABELS } from '$lib/api.js';

	const BOARD_STATUSES = ['open', 'assigned', 'in_progress', 'resolved'];

	/** Next status for “Proceed further” */
	const NEXT = {
		open: 'assigned',
		assigned: 'in_progress',
		in_progress: 'resolved'
	};

	const NEXT_LABEL = {
		open: 'Assign & proceed',
		assigned: 'Start work',
		in_progress: 'Mark resolved'
	};

	let stats = null;
	let officers = [];
	let byStatus = {};
	let loading = true;
	let error = '';
	let category = '';
	let actionMsg = '';
	let busyId = '';
	/** Mobile tab: which column is visible */
	let activeTab = 'open';

	const CATEGORIES = Object.keys(LABELS.categories);

	$: isStaff =
		$auth.user && ($auth.user.role === 'officer' || $auth.user.role === 'admin');

	async function loadBoard() {
		loading = true;
		error = '';
		try {
			const [statsRes, officersRes, ...lists] = await Promise.all([
				AdminAPI.stats(),
				AdminAPI.officers(),
				...BOARD_STATUSES.map((s) =>
					GrievanceAPI.list({
						status: s,
						category: category || undefined,
						limit: 40,
						page: 1
					})
				)
			]);
			stats = statsRes.data;
			officers = officersRes.data || [];
			const next = {};
			BOARD_STATUSES.forEach((s, i) => {
				next[s] = lists[i].data || [];
			});
			byStatus = next;
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
		if (!isStaff) {
			error = 'Staff access only (officer or admin).';
			loading = false;
			return;
		}
		loadBoard();
	});

	async function advance(g) {
		const next = NEXT[g.status];
		if (!next) return;
		actionMsg = '';
		busyId = g.id;
		try {
			if (g.status === 'open' && !g.assigneeId && $auth.user?.id) {
				// Assign to me → status becomes "assigned" (same as proceed)
				await GrievanceAPI.assign(g.id, $auth.user.id);
			} else {
				await GrievanceAPI.updateStatus(g.id, next);
			}
			actionMsg = `${g.trackingCode} → ${LABELS.statuses[next]}`;
			await loadBoard();
		} catch (e) {
			error = e.message;
		}
		busyId = '';
	}

	async function reject(g) {
		if (!confirm(`Reject ticket ${g.trackingCode}?`)) return;
		busyId = g.id;
		try {
			await GrievanceAPI.updateStatus(g.id, 'rejected', 'Rejected by staff');
			actionMsg = `Rejected ${g.trackingCode}`;
			await loadBoard();
		} catch (e) {
			error = e.message;
		}
		busyId = '';
	}

	async function assignTo(g, assigneeId) {
		if (!assigneeId) return;
		busyId = g.id;
		actionMsg = '';
		try {
			await GrievanceAPI.assign(g.id, assigneeId);
			const who =
				officers.find((o) => o.id === assigneeId)?.fullName ||
				(assigneeId === $auth.user?.id ? 'you' : 'staff');
			actionMsg = `Assigned ${g.trackingCode} → ${who}`;
			await loadBoard();
		} catch (e) {
			error = e.message;
		}
		busyId = '';
	}

	function filterCategory(c) {
		category = category === c ? '' : c;
		loadBoard();
	}

	function tabCount(s) {
		return byStatus[s]?.length || 0;
	}

	function shortDesc(t) {
		if (!t) return '';
		return t.length > 100 ? t.slice(0, 100) + '…' : t;
	}
</script>

<section class="admin-page">
	<header class="admin-header">
		<div>
			<h2 class="page-title">Operations board</h2>
			<p class="page-sub">
				Assign · proceed · resolve. Filter <strong>Cow Welfare</strong> for animal concerns.
			</p>
		</div>
		<button type="button" class="btn btn-ghost btn-sm refresh-btn" on:click={loadBoard} disabled={loading}>
			↻ Refresh
		</button>
	</header>

	{#if error}
		<div class="alert alert-error">{error}</div>
	{/if}
	{#if actionMsg}
		<div class="alert alert-success">{actionMsg}</div>
	{/if}

	{#if !isStaff && !loading}
		<div class="empty-state glass-panel">You do not have staff permissions.</div>
	{:else if loading && !stats}
		<div class="empty-state">Loading board…</div>
	{:else}
		{#if stats}
			<div class="stats-grid admin-stats">
				<div class="glass-panel stat-card">
					<div class="value">{stats.counts.total}</div>
					<div class="label">Total</div>
				</div>
				<div class="glass-panel stat-card warn">
					<div class="value">{stats.counts.open}</div>
					<div class="label">Open</div>
				</div>
				<div class="glass-panel stat-card">
					<div class="value">{stats.counts.in_progress}</div>
					<div class="label">In progress</div>
				</div>
				<div class="glass-panel stat-card ok">
					<div class="value">{stats.counts.resolved}</div>
					<div class="label">Resolved</div>
				</div>
				<div class="glass-panel stat-card">
					<div class="value">{stats.counts.last_24h}</div>
					<div class="label">Last 24h</div>
				</div>
			</div>
		{/if}

		<div class="filters" role="toolbar" aria-label="Category filters">
			<span class="muted filter-label">Filter</span>
			<button
				type="button"
				class="btn btn-sm filter-chip"
				class:active={category === 'cow_welfare'}
				on:click={() => filterCategory('cow_welfare')}
			>
				🐄 Cow Welfare
			</button>
			{#each CATEGORIES as c}
				{#if c !== 'cow_welfare'}
					<button
						type="button"
						class="btn btn-sm filter-chip"
						class:active={category === c}
						on:click={() => filterCategory(c)}
					>
						{LABELS.categories[c]}
					</button>
				{/if}
			{/each}
			{#if category}
				<button type="button" class="btn btn-sm btn-ghost" on:click={() => filterCategory(category)}>
					Clear
				</button>
			{/if}
		</div>

		<!-- Mobile: status tabs -->
		<div class="status-tabs" role="tablist" aria-label="Ticket status">
			{#each BOARD_STATUSES as s}
				<button
					type="button"
					role="tab"
					class="status-tab"
					class:active={activeTab === s}
					aria-selected={activeTab === s}
					on:click={() => (activeTab = s)}
				>
					<span class="tab-name">{LABELS.statuses[s]}</span>
					<span class="tab-count">{tabCount(s)}</span>
				</button>
			{/each}
		</div>

		<div class="kanban-board">
			{#each BOARD_STATUSES as s}
				<div
					class="kanban-column"
					class:column-active={activeTab === s}
					class:column-open={s === 'open'}
					data-status={s}
				>
					<div class="column-head">
						<h3>{LABELS.statuses[s]}</h3>
						<span class="col-count">{tabCount(s)}</span>
					</div>

					{#if s === 'open'}
						<p class="column-hint">Unassigned / new — pick an assignee, then proceed or reject.</p>
					{/if}

					{#if !(byStatus[s]?.length)}
						<div class="column-empty muted">No tickets</div>
					{/if}

					{#each byStatus[s] || [] as g (g.id)}
						<article class="glass-panel task-card" class:busy={busyId === g.id}>
							<div class="task-top">
								<a class="task-title" href="/grievance/{g.id}">{g.title}</a>
								<span class="badge badge-{g.status}">{LABELS.statuses[g.status]}</span>
							</div>
							<p class="task-desc">{shortDesc(g.description)}</p>

							<div class="task-meta">
								<span class="badge">{LABELS.categories[g.category] || g.category}</span>
								<span class="muted mono">{g.trackingCode}</span>
								<span class="muted">▲ {g.upvoteCount}</span>
							</div>

							<!-- Assignee row: always visible; critical on Open -->
							<div class="assignee-row" class:needs-assignee={s === 'open' && !g.assigneeId}>
								<label class="assignee-label" for="assign-{g.id}">Assignee</label>
								{#if s === 'resolved'}
									<span class="assignee-value">{g.assigneeName || '—'}</span>
								{:else}
									<select
										id="assign-{g.id}"
										class="select-field assignee-select"
										disabled={busyId === g.id}
										value={g.assigneeId || ''}
										on:change={(e) => assignTo(g, e.currentTarget.value)}
									>
										<option value="">
											{s === 'open' ? '— Unassigned —' : '— Choose staff —'}
										</option>
										{#each officers as o}
											<option value={o.id}>{o.fullName} ({o.role})</option>
										{/each}
										{#if $auth.user && !officers.some((o) => o.id === $auth.user.id)}
											<option value={$auth.user.id}>Me ({$auth.user.fullName})</option>
										{/if}
									</select>
								{/if}
							</div>

							<div class="task-actions">
								<a class="btn btn-sm btn-ghost" href="/grievance/{g.id}">Open</a>
								{#if NEXT[g.status]}
									<button
										type="button"
										class="btn btn-primary btn-sm"
										disabled={busyId === g.id}
										on:click={() => advance(g)}
									>
										{NEXT_LABEL[g.status] || 'Proceed'} →
									</button>
								{/if}
								{#if g.status !== 'resolved' && g.status !== 'rejected'}
									<button
										type="button"
										class="btn btn-sm btn-danger"
										disabled={busyId === g.id}
										on:click={() => reject(g)}
									>
										Reject
									</button>
								{/if}
							</div>
						</article>
					{/each}
				</div>
			{/each}
		</div>

		{#if officers.length}
			<p class="staff-line muted">
				<strong>Staff pool:</strong>
				{officers.map((o) => o.fullName).join(' · ')}
			</p>
		{/if}
	{/if}
</section>

<style>
	.admin-page {
		width: 100%;
		max-width: 100%;
	}

	.admin-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 4px;
	}

	.refresh-btn {
		min-height: 44px;
		flex-shrink: 0;
	}

	.admin-stats .stat-card.warn .value {
		color: #fbbf24;
	}
	.admin-stats .stat-card.ok .value {
		color: #34d399;
	}

	.filter-label {
		align-self: center;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.filter-chip {
		min-height: 40px;
	}

	/* Mobile tabs — hidden on wide screens */
	.status-tabs {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		padding: 4px 0 14px;
		margin-bottom: 4px;
		scrollbar-width: none;
	}
	.status-tabs::-webkit-scrollbar {
		display: none;
	}

	.status-tab {
		flex: 1 0 auto;
		min-width: 4.5rem;
		min-height: 48px;
		padding: 8px 10px;
		border-radius: 12px;
		border: 1px solid var(--border-color);
		background: rgba(15, 23, 42, 0.5);
		color: var(--text-muted);
		font-weight: 600;
		font-size: 0.78rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		cursor: pointer;
	}
	.status-tab.active {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(59, 130, 246, 0.55);
		color: var(--text-main);
	}
	.tab-count {
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-main);
	}

	.kanban-board {
		display: flex;
		gap: 14px;
		overflow-x: auto;
		padding-bottom: 16px;
		-webkit-overflow-scrolling: touch;
		scroll-snap-type: x mandatory;
	}

	.kanban-column {
		flex: 1 1 0;
		min-width: min(100%, 280px);
		max-width: 100%;
		scroll-snap-align: start;
	}

	.column-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
		gap: 8px;
	}
	.column-head h3 {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.col-count {
		background: rgba(255, 255, 255, 0.08);
		border-radius: 999px;
		padding: 2px 8px;
		font-size: 0.75rem;
		font-weight: 700;
	}

	.column-hint {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin: 0 0 10px;
		line-height: 1.35;
	}

	.column-empty {
		padding: 18px 12px;
		text-align: center;
		border: 1px dashed var(--border-color);
		border-radius: 10px;
		font-size: 0.85rem;
	}

	.task-card {
		padding: 14px;
		margin-bottom: 12px;
		display: grid;
		gap: 10px;
	}
	.task-card.busy {
		opacity: 0.65;
		pointer-events: none;
	}

	.task-top {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 8px;
	}
	.task-title {
		font-weight: 700;
		font-size: 0.98rem;
		line-height: 1.3;
		color: var(--text-main);
	}
	.task-title:hover {
		color: #93c5fd;
		text-decoration: underline;
	}
	.task-desc {
		font-size: 0.84rem;
		color: var(--text-muted);
		margin: 0;
		line-height: 1.4;
	}

	.task-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 10px;
		align-items: center;
	}
	.mono {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.72rem;
	}

	.assignee-row {
		display: grid;
		gap: 4px;
		padding: 8px;
		border-radius: 10px;
		background: rgba(15, 23, 42, 0.4);
		border: 1px solid var(--border-color);
	}
	.assignee-row.needs-assignee {
		border-color: rgba(245, 158, 11, 0.45);
		background: rgba(245, 158, 11, 0.08);
	}
	.assignee-label {
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		margin: 0;
	}
	.assignee-select {
		min-height: 44px;
		width: 100%;
		font-size: 0.9rem;
	}
	.assignee-value {
		font-size: 0.9rem;
		font-weight: 600;
	}

	.task-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.task-actions .btn {
		min-height: 44px;
		flex: 1 1 auto;
	}

	.staff-line {
		margin-top: 16px;
		font-size: 0.85rem;
		line-height: 1.5;
	}

	/* Phone: one column via tabs */
	@media (max-width: 900px) {
		.kanban-board {
			display: block;
			overflow: visible;
			scroll-snap-type: none;
		}
		.kanban-column {
			display: none;
			min-width: 0;
			max-width: none;
		}
		.kanban-column.column-active {
			display: block;
		}
	}

	/* Desktop / wide: hide tabs, show all columns */
	@media (min-width: 901px) {
		.status-tabs {
			display: none;
		}
		.kanban-board {
			display: grid;
			grid-template-columns: repeat(4, minmax(0, 1fr));
			gap: 14px;
			overflow: visible;
		}
		.kanban-column {
			min-width: 0;
		}
	}

	/* Extra-wide */
	@media (min-width: 1280px) {
		.admin-page :global(.container) {
			max-width: none;
		}
	}

	@media (max-width: 480px) {
		.admin-header {
			flex-direction: column;
			align-items: stretch;
		}
		.refresh-btn {
			width: 100%;
		}
		.task-actions .btn {
			flex: 1 1 100%;
		}
	}
</style>
