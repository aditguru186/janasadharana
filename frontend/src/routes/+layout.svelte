<script>
	import '../app.css';
	import { auth, clearAuth } from '$lib/auth.js';
	import { AuthAPI } from '$lib/api.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t, lang, setLang } from '$lib/i18n.js';

	async function logout() {
		await AuthAPI.logout();
		clearAuth();
		goto('/');
	}

	$: user = $auth.user;
	$: isStaff = user && (user.role === 'officer' || user.role === 'admin');
	$: isCowFlow = $page.url.pathname.startsWith('/cow');
</script>

<div class="container" class:cow-container={isCowFlow}>
	<header class="header" class:header-compact={isCowFlow}>
		<a href="/" class="brand">
			<h1>{$t('brand')}</h1>
			<p>{$t('brandSub')}</p>
		</a>

		<nav class="nav">
			{#if !isCowFlow}
				<div class="lang-toggle nav-lang" role="group" aria-label="Language">
					<button
						type="button"
						class="lang-btn"
						class:active={$lang === 'en'}
						on:click={() => setLang('en')}>EN</button
					>
					<button
						type="button"
						class="lang-btn"
						class:active={$lang === 'or'}
						on:click={() => setLang('or')}>ଓଡ଼ିଆ</button
					>
				</div>
			{/if}
			<a href="/" class="btn btn-ghost btn-sm">{$t('navHome')}</a>
			<a href="/cow" class="btn btn-sm cow-nav-btn">{$t('navCow')}</a>
			<a href="/track" class="btn btn-ghost btn-sm">{$t('navTrack')}</a>
			{#if user}
				<a href="/submit" class="btn btn-primary btn-sm">+ {$t('navSubmit')}</a>
				<a href="/my" class="btn btn-ghost btn-sm">{$t('navMy')}</a>
				{#if isStaff}
					<a href="/admin" class="btn btn-ghost btn-sm">{$t('navOps')}</a>
				{/if}
				<span class="user-chip">{user.fullName} · {user.role}</span>
				<button type="button" class="btn btn-sm btn-danger" on:click={logout}>{$t('navLogout')}</button>
			{:else if !isCowFlow}
				<a href="/login" class="btn btn-ghost btn-sm">{$t('navLogin')}</a>
				<a href="/register" class="btn btn-primary btn-sm">{$t('navRegister')}</a>
			{/if}
		</nav>
	</header>

	<main>
		<slot />
	</main>

	<footer
		class="muted"
		style="margin-top: 40px; text-align: center; padding-top: 20px; border-top: 1px solid var(--border-color);"
	>
		{$t('footer')}
	</footer>
</div>

<style>
	.cow-nav-btn {
		background: rgba(245, 158, 11, 0.18);
		border: 1px solid rgba(245, 158, 11, 0.4);
		color: #fcd34d;
	}

	.cow-nav-btn:hover {
		background: rgba(245, 158, 11, 0.28);
	}

	.nav-lang {
		display: inline-flex;
		border: 1px solid var(--border-color);
		border-radius: 999px;
		overflow: hidden;
		background: rgba(15, 23, 42, 0.5);
	}

	:global(.lang-btn) {
		border: 0;
		background: transparent;
		color: var(--text-muted);
		padding: 6px 10px;
		font-weight: 700;
		font-size: 0.78rem;
		cursor: pointer;
	}

	:global(.lang-btn.active) {
		background: var(--primary);
		color: #fff;
	}

	.cow-container {
		max-width: 640px;
	}

	.header-compact {
		margin-bottom: 12px;
		padding-bottom: 12px;
	}

	@media (max-width: 640px) {
		.nav {
			width: 100%;
		}
	}
</style>
