<script>
	import { AuthAPI } from "$lib/api.js";
	import { setSession } from "$lib/auth.js";
	import { goto } from "$app/navigation";

	let phone = "";
	let password = "";
	let error = "";
	let loading = false;

	async function handleSubmit() {
		error = "";
		loading = true;
		try {
			const res = await AuthAPI.login({ phone, password });
			setSession(res.data);
			const role = res.data.user?.role;
			goto(role === "officer" || role === "admin" ? "/admin" : "/");
		} catch (e) {
			error = e.message;
		}
		loading = false;
	}
</script>

<div class="glass-panel form-panel">
	<h2>Login</h2>
	<p class="subtitle">
		Citizens, officers, and admins — same portal, role-based access.
	</p>

	{#if error}
		<div class="alert alert-error">{error}</div>
	{/if}

	<form on:submit|preventDefault={handleSubmit}>
		<label class="field-label" for="phone">Mobile number</label>
		<input
			id="phone"
			class="input-field"
			type="tel"
			bind:value={phone}
			placeholder="10-digit mobile"
			required
			autocomplete="on"
		/>

		<label class="field-label" for="password">Password</label>
		<input
			id="password"
			class="input-field"
			type="password"
			bind:value={password}
			required
			autocomplete="current-password"
		/>

		<button
			type="submit"
			class="btn btn-primary"
			style="width: 100%;"
			disabled={loading}
		>
			{loading ? "Signing in…" : "Sign in"}
		</button>
	</form>

	<p class="muted" style="margin-top: 18px; text-align: center;">
		No account?
		<a href="/register" style="color: #93c5fd;">Register as citizen</a>
	</p>
</div>
