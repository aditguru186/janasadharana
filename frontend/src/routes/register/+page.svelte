<script>
	import { AuthAPI } from '$lib/api.js';
	import { setSession } from '$lib/auth.js';
	import { goto } from '$app/navigation';

	let fullName = '';
	let phone = '';
	let email = '';
	let password = '';
	let error = '';
	let loading = false;

	async function handleSubmit() {
		error = '';
		loading = true;
		try {
			const res = await AuthAPI.register({
				fullName,
				phone,
				email: email || undefined,
				password
			});
			setSession(res.data);
			goto('/submit');
		} catch (e) {
			error = e.message;
		}
		loading = false;
	}
</script>

<div class="glass-panel form-panel">
	<h2>Create citizen account</h2>
	<p class="subtitle">Use your mobile number. You will get a tracking code for every grievance.</p>

	{#if error}
		<div class="alert alert-error">{error}</div>
	{/if}

	<form on:submit|preventDefault={handleSubmit}>
		<label class="field-label" for="fullName">Full name</label>
		<input id="fullName" class="input-field" bind:value={fullName} required minlength="2" />

		<label class="field-label" for="phone">Mobile number</label>
		<input
			id="phone"
			class="input-field"
			type="tel"
			bind:value={phone}
			placeholder="10-digit mobile"
			required
		/>

		<label class="field-label" for="email">Email (optional)</label>
		<input id="email" class="input-field" type="email" bind:value={email} />

		<label class="field-label" for="password">Password (min 8 characters)</label>
		<input
			id="password"
			class="input-field"
			type="password"
			bind:value={password}
			required
			minlength="8"
		/>

		<button type="submit" class="btn btn-primary" style="width: 100%;" disabled={loading}>
			{loading ? 'Creating…' : 'Register'}
		</button>
	</form>

	<p class="muted" style="margin-top: 18px; text-align: center;">
		Already registered? <a href="/login" style="color: #93c5fd;">Login</a>
	</p>
</div>
