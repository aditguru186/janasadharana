<script>
	import { onDestroy, onMount } from 'svelte';
	import { t, lang, setLang } from '$lib/i18n.js';
	import { CowConcernAPI, AgentsAPI } from '$lib/api.js';

	let concernText = '';
	let concernType = 'injured';
	let reporterName = '';
	let reporterPhone = '';
	let landmark = '';
	let lat = /** @type {number|null} */ (null);
	let lng = /** @type {number|null} */ (null);
	let locationLabel = '';
	let locating = false;

	let imagePreviews = /** @type {string[]} */ ([]);
	let imagesBase64 = /** @type {string[]} */ ([]);
	let voiceBase64 = /** @type {string|null} */ (null);
	let voiceUrl = /** @type {string|null} */ (null);
	let recording = false;
	/** @type {MediaRecorder|null} */
	let mediaRecorder = null;
	/** @type {Blob[]} */
	let voiceChunks = [];

	let error = '';
	let submitting = false;
	let done = false;
	let trackingCode = '';
	let concernId = '';
	let agentCount = 0;
	let showContact = false;

	const TYPES = [
		'injured',
		'unwell',
		'stranded',
		'hit_by_vehicle',
		'malnourished',
		'other'
	];

	onMount(async () => {
		try {
			const res = await AgentsAPI.availableCount();
			agentCount = res.data?.count ?? 0;
		} catch {
			agentCount = 0;
		}
		// Soft-request GPS early so submit is one-tap
		captureLocation(true);
	});

	onDestroy(() => {
		stopRecording(true);
		if (voiceUrl) URL.revokeObjectURL(voiceUrl);
	});

	async function captureLocation(silent = false) {
		if (!silent) error = '';
		locating = true;
		try {
			const position = await new Promise((resolve, reject) => {
				if (!navigator.geolocation) {
					reject(Object.assign(new Error('no-geo'), { code: 0 }));
					return;
				}
				navigator.geolocation.getCurrentPosition(resolve, reject, {
					enableHighAccuracy: true,
					timeout: 18000,
					maximumAge: 0
				});
			});
			lat = position.coords.latitude;
			lng = position.coords.longitude;
			locationLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
		} catch (e) {
			if (!silent) {
				error =
					e && e.code === 1
						? $t('cowLocDenied')
						: $t('cowLocError');
			}
		}
		locating = false;
	}

	function usePuriDemo() {
		lat = 19.8134;
		lng = 85.8245;
		locationLabel = '19.81340, 85.82450 · Puri centre';
		error = '';
	}

	async function onPhotoChange(e) {
		error = '';
		const files = Array.from(e.target?.files || []).slice(0, 5 - imagesBase64.length);
		for (const file of files) {
			if (!file.type.startsWith('image/')) continue;
			let dataUrl;
			try {
				dataUrl =
					file.size > 700 * 1024
						? await compressImage(file, 0.72, 1280)
						: await fileToDataUrl(file);
			} catch {
				continue;
			}
			imagesBase64 = [...imagesBase64, dataUrl];
			imagePreviews = [...imagePreviews, dataUrl];
		}
		e.target.value = '';
	}

	function removeImage(i) {
		imagesBase64 = imagesBase64.filter((_, idx) => idx !== i);
		imagePreviews = imagePreviews.filter((_, idx) => idx !== i);
	}

	function fileToDataUrl(file) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(/** @type {string} */ (reader.result));
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	function compressImage(file, quality, maxEdge) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			const url = URL.createObjectURL(file);
			img.onload = () => {
				let { width, height } = img;
				const scale = Math.min(1, maxEdge / Math.max(width, height));
				width = Math.round(width * scale);
				height = Math.round(height * scale);
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				canvas.getContext('2d').drawImage(img, 0, 0, width, height);
				URL.revokeObjectURL(url);
				resolve(canvas.toDataURL('image/jpeg', quality));
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('fail'));
			};
			img.src = url;
		});
	}

	async function startRecording() {
		error = '';
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			voiceChunks = [];
			const mime = MediaRecorder.isTypeSupported('audio/webm')
				? 'audio/webm'
				: MediaRecorder.isTypeSupported('audio/mp4')
					? 'audio/mp4'
					: '';
			mediaRecorder = mime
				? new MediaRecorder(stream, { mimeType: mime })
				: new MediaRecorder(stream);
			mediaRecorder.ondataavailable = (ev) => {
				if (ev.data?.size) voiceChunks.push(ev.data);
			};
			mediaRecorder.onstop = async () => {
				stream.getTracks().forEach((tr) => tr.stop());
				const blob = new Blob(voiceChunks, {
					type: mediaRecorder?.mimeType || 'audio/webm'
				});
				if (blob.size > 1.5 * 1024 * 1024) {
					error = $lang === 'or' ? 'ଭଏସ୍ ବହୁତ ଲମ୍ବା।' : 'Voice note too long.';
					return;
				}
				if (voiceUrl) URL.revokeObjectURL(voiceUrl);
				voiceUrl = URL.createObjectURL(blob);
				voiceBase64 = await blobToDataUrl(blob);
			};
			mediaRecorder.start();
			recording = true;
		} catch {
			error = $lang === 'or' ? 'ମାଇକ୍ ଅନୁମତି ନାହିଁ।' : 'Microphone permission denied.';
		}
	}

	function stopRecording(silent = false) {
		if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
		recording = false;
		if (!silent) mediaRecorder = null;
	}

	function clearVoice() {
		stopRecording(true);
		voiceBase64 = null;
		if (voiceUrl) URL.revokeObjectURL(voiceUrl);
		voiceUrl = null;
	}

	function blobToDataUrl(blob) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(/** @type {string} */ (reader.result));
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	}

	async function handleSubmit() {
		error = '';
		if (concernText.trim().length < 3 && !voiceBase64) {
			error =
				$lang === 'or'
					? 'ଟେକ୍ସଟ୍ ଲେଖନ୍ତୁ କିମ୍ବା ଭଏସ୍ ରେକର୍ଡ କରନ୍ତୁ।'
					: 'Type your concern or record a voice note.';
			return;
		}
		if (lat == null || lng == null) {
			error = $t('cowLocNeed');
			showContact = true;
			await captureLocation(false);
			if (lat == null) return;
		}
		submitting = true;
		try {
			const res = await CowConcernAPI.create({
				concernText: concernText.trim() || undefined,
				concernType,
				reporterName: reporterName.trim() || undefined,
				reporterPhone: reporterPhone.replace(/\D/g, '') || undefined,
				landmark: landmark.trim() || undefined,
				location: { type: 'Point', coordinates: [lng, lat] },
				voiceBase64: voiceBase64 || undefined,
				imagesBase64: imagesBase64.length ? imagesBase64 : undefined
			});
			trackingCode = res.data.trackingCode;
			concernId = res.data.id;
			done = true;
		} catch (e) {
			error = e.message || 'Submit failed';
		}
		submitting = false;
	}

	function resetAll() {
		done = false;
		trackingCode = '';
		concernId = '';
		concernText = '';
		concernType = 'injured';
		reporterName = '';
		reporterPhone = '';
		landmark = '';
		imagesBase64 = [];
		imagePreviews = [];
		clearVoice();
		error = '';
	}
</script>

<div class="cw">
	<div class="orbs" aria-hidden="true">
		<span class="orb orb-a"></span>
		<span class="orb orb-b"></span>
		<span class="orb orb-c"></span>
		<span class="shine"></span>
	</div>

	<header class="cw-head">
		<div class="brand-row">
			<div class="logo-mark">🐄</div>
			<div>
				<p class="eyebrow">Janasadharana · Puri 20 km</p>
				<h1>{$lang === 'or' ? 'ଗୋ-କଲ୍ୟାଣ' : 'Cow Welfare'}</h1>
			</div>
		</div>
		<div class="head-actions">
			<div class="lang-pill" role="group" aria-label="Language">
				<button type="button" class:on={$lang === 'en'} on:click={() => setLang('en')}>EN</button>
				<button type="button" class:on={$lang === 'or'} on:click={() => setLang('or')}>ଓଡ଼ିଆ</button>
			</div>
			{#if agentCount > 0}
				<span class="live-chip">
					<span class="dot"></span>
					{agentCount} {$lang === 'or' ? 'ଏଜେଣ୍ଟ ସକ୍ରିୟ' : 'agents live'}
				</span>
			{/if}
		</div>
	</header>

	{#if done}
		<section class="dialog success-dialog">
			<div class="success-burst" aria-hidden="true">✓</div>
			<h2>{$t('cowSuccessTitle')}</h2>
			<p>{$t('cowSuccessBody')}</p>
			<p class="code-label">{$t('cowTracking')}</p>
			<p class="code">{trackingCode}</p>
			<div class="btn-row">
				<a class="btn-glow" href="/track?code={trackingCode}">{$t('cowTrackBtn')}</a>
				<button type="button" class="btn-soft" on:click={resetAll}>{$t('cowAnother')}</button>
			</div>
		</section>
	{:else}
		<section class="dialog raise-dialog">
			<div class="dialog-glow" aria-hidden="true"></div>
			<div class="dialog-inner">
				<p class="dialog-kicker">
					{$lang === 'or' ? 'ସମସ୍ୟା ଜଣାନ୍ତୁ' : 'Raise a concern'}
				</p>
				<h2>
					{$lang === 'or'
						? 'ଆହତ / ଅସୁସ୍ଥ ଗାଈ ଦେଖିଲେ?'
						: 'See an injured or unwell cow?'}
				</h2>
				<p class="dialog-sub">
					{$lang === 'or'
						? 'ଭଏସ୍ କିମ୍ବା ଟେକ୍ସଟ୍ ରେ କୁହନ୍ତୁ — ଫଟୋ ଯୋଡ଼ିପାରିବେ। ଗ୍ରାଉଣ୍ଡ ଏଜେଣ୍ଟ ପହଞ୍ଚିବେ।'
						: 'Speak or type what you see. Add a photo if you can. Ground agents will respond.'}
				</p>

				{#if error}
					<div class="err">{error}</div>
				{/if}

				<!-- PRIMARY: concern input -->
				<div class="composer">
					<textarea
						class="concern-input"
						bind:value={concernText}
						rows="4"
						maxlength="5000"
						placeholder={$t('cowDescribePh')}
						aria-label={$t('cowDescribe')}
					></textarea>

					<div class="composer-tools">
						<div class="tool-group">
							{#if recording}
								<button type="button" class="tool-btn danger pulse" on:click={() => stopRecording()}>
									⏹ {$t('cowVoiceStop')}
								</button>
							{:else if voiceBase64}
								<button type="button" class="tool-btn ok" on:click={clearVoice}>
									🎤 {$t('cowVoiceReady')} · ✕
								</button>
							{:else}
								<button type="button" class="tool-btn mic" on:click={startRecording}>
									🎤 {$t('cowVoiceStart')}
								</button>
							{/if}

							<label class="tool-btn photo">
								📷 {$lang === 'or' ? 'ଫଟୋ' : 'Photo'}
								<input
									type="file"
									accept="image/*"
									capture="environment"
									multiple
									on:change={onPhotoChange}
								/>
							</label>
						</div>

						<select class="type-select" bind:value={concernType} aria-label={$t('cowCondition')}>
							{#each TYPES as ty}
								<option value={ty}>{$t(`cond_${ty}`)}</option>
							{/each}
						</select>
					</div>

					{#if voiceUrl}
						<audio class="voice-bar" controls src={voiceUrl}></audio>
					{/if}

					{#if imagePreviews.length}
						<div class="thumbs">
							{#each imagePreviews as src, i}
								<div class="thumb">
									<img {src} alt="upload {i + 1}" />
									<button type="button" class="thumb-x" on:click={() => removeImage(i)}>×</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Contact + GPS strip -->
				<button
					type="button"
					class="contact-toggle"
					on:click={() => (showContact = !showContact)}
				>
					{showContact ? '▾' : '▸'}
					{$lang === 'or' ? 'ଯୋଗାଯୋଗ + ଲୋକେସନ୍' : 'Contact + location'}
					<span class="loc-pill" class:ok={lat != null}>
						{lat != null ? '📍 GPS on' : '📍 GPS needed'}
					</span>
				</button>

				{#if showContact}
					<div class="contact-grid">
						<label>
							<span>{$t('cowName')}</span>
							<input bind:value={reporterName} autocomplete="name" />
						</label>
						<label>
							<span>{$t('cowPhone')}</span>
							<input
								type="tel"
								inputmode="numeric"
								bind:value={reporterPhone}
								placeholder="9XXXXXXXXX"
								autocomplete="tel"
							/>
						</label>
						<label class="full">
							<span>{$t('cowLandmark')}</span>
							<input bind:value={landmark} placeholder={$t('cowLandmarkPh')} />
						</label>
						<div class="loc-row full">
							<span class="loc-text">{locationLabel || $t('cowLocPending')}</span>
							<button type="button" class="btn-soft sm" on:click={() => captureLocation(false)} disabled={locating}>
								{locating ? $t('cowLocating') : $t('cowShareLocation')}
							</button>
							<button type="button" class="btn-soft sm" on:click={usePuriDemo}>{$t('cowDemoLoc')}</button>
						</div>
					</div>
				{/if}

				<button
					type="button"
					class="btn-glow submit"
					on:click={handleSubmit}
					disabled={submitting}
				>
					{#if submitting}
						<span class="spinner"></span>
						{$t('cowSubmitting')}
					{:else}
						✨ {$t('cowSubmit')}
					{/if}
				</button>

				<p class="fineprint">
					{$lang === 'or'
						? 'ପୁରୀ ୨୦ କିମି ଭିତରେ GPS ଆବଶ୍ୟକ। ମିଡ଼ିଆ Cloudflare R2 ରେ ସୁରକ୍ଷିତ ଭାବେ ଷ୍ଟୋର୍ ହୁଏ।'
						: 'GPS required inside Puri 20 km. Photos & voice secure on Cloudflare R2.'}
				</p>
			</div>
		</section>

		<section class="features">
			<div class="feat">
				<span>🎤</span>
				<strong>{$lang === 'or' ? 'ଭଏସ୍' : 'Voice'}</strong>
				<p>{$lang === 'or' ? 'କହି ଦିଅନ୍ତୁ' : 'Just speak it'}</p>
			</div>
			<div class="feat">
				<span>📷</span>
				<strong>{$lang === 'or' ? 'ଫଟୋ' : 'Photo'}</strong>
				<p>{$lang === 'or' ? 'ତୁରନ୍ତ ଅପଲୋଡ୍' : 'Instant upload'}</p>
			</div>
			<div class="feat">
				<span>🛰️</span>
				<strong>GPS</strong>
				<p>{$lang === 'or' ? 'ସଠିକ୍ ସ୍ଥାନ' : 'Exact pin'}</p>
			</div>
			<div class="feat">
				<span>👷</span>
				<strong>{$lang === 'or' ? 'ଏଜେଣ୍ଟ' : 'Agents'}</strong>
				<p>{$lang === 'or' ? 'ଗ୍ରାଉଣ୍ଡ ଟିମ୍' : 'On the ground'}</p>
			</div>
		</section>
	{/if}
</div>

<style>
	.cw {
		--cw-bg: #f4f7ff;
		--cw-ink: #0f172a;
		--cw-muted: #64748b;
		--cw-card: rgba(255, 255, 255, 0.78);
		--cw-border: rgba(148, 163, 184, 0.28);
		--cw-pink: #ff4d8d;
		--cw-violet: #7c5cff;
		--cw-cyan: #22d3ee;
		--cw-amber: #fbbf24;
		--cw-lime: #34d399;
		position: relative;
		max-width: 560px;
		margin: 0 auto;
		padding: 8px 4px 48px;
		color: var(--cw-ink);
		isolation: isolate;
		min-height: 78vh;
	}

	.orbs {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: -1;
		overflow: hidden;
		background:
			radial-gradient(1200px 600px at 10% -10%, rgba(124, 92, 255, 0.22), transparent 55%),
			radial-gradient(900px 500px at 100% 0%, rgba(255, 77, 141, 0.18), transparent 50%),
			radial-gradient(800px 500px at 50% 100%, rgba(34, 211, 238, 0.16), transparent 55%),
			linear-gradient(180deg, #f8faff 0%, #eef2ff 40%, #fdf4ff 100%);
	}

	.orb {
		position: absolute;
		border-radius: 50%;
		filter: blur(40px);
		opacity: 0.65;
		animation: float 12s ease-in-out infinite;
	}
	.orb-a {
		width: 220px;
		height: 220px;
		background: #a78bfa;
		top: 12%;
		left: -40px;
	}
	.orb-b {
		width: 180px;
		height: 180px;
		background: #f472b6;
		top: 40%;
		right: -30px;
		animation-delay: -4s;
	}
	.orb-c {
		width: 160px;
		height: 160px;
		background: #67e8f9;
		bottom: 8%;
		left: 30%;
		animation-delay: -7s;
	}
	.shine {
		position: absolute;
		inset: -20% 20% auto;
		height: 40%;
		background: linear-gradient(
			100deg,
			transparent,
			rgba(255, 255, 255, 0.55),
			transparent
		);
		transform: skewX(-18deg);
		animation: sheen 7s linear infinite;
	}

	@keyframes float {
		0%,
		100% {
			transform: translateY(0) scale(1);
		}
		50% {
			transform: translateY(-18px) scale(1.05);
		}
	}
	@keyframes sheen {
		0% {
			transform: translateX(-40%) skewX(-18deg);
			opacity: 0;
		}
		20% {
			opacity: 0.7;
		}
		50% {
			transform: translateX(60%) skewX(-18deg);
			opacity: 0.35;
		}
		100% {
			transform: translateX(120%) skewX(-18deg);
			opacity: 0;
		}
	}

	.cw-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 18px;
		flex-wrap: wrap;
	}
	.brand-row {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.logo-mark {
		width: 52px;
		height: 52px;
		border-radius: 16px;
		display: grid;
		place-items: center;
		font-size: 1.6rem;
		background: linear-gradient(135deg, #fff 0%, #ede9fe 100%);
		box-shadow:
			0 10px 30px rgba(124, 92, 255, 0.25),
			inset 0 0 0 1px rgba(255, 255, 255, 0.8);
	}
	.eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cw-violet);
		margin: 0 0 2px;
	}
	.cw-head h1 {
		font-size: clamp(1.35rem, 4vw, 1.7rem);
		font-weight: 800;
		letter-spacing: -0.03em;
		margin: 0;
		background: linear-gradient(120deg, #0f172a 10%, #7c5cff 55%, #ff4d8d 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.head-actions {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.lang-pill {
		display: inline-flex;
		background: rgba(255, 255, 255, 0.85);
		border: 1px solid var(--cw-border);
		border-radius: 999px;
		overflow: hidden;
		box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
	}
	.lang-pill button {
		border: 0;
		background: transparent;
		padding: 8px 12px;
		font-weight: 700;
		font-size: 0.78rem;
		color: var(--cw-muted);
		cursor: pointer;
	}
	.lang-pill button.on {
		background: linear-gradient(120deg, #7c5cff, #ff4d8d);
		color: #fff;
	}
	.live-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		font-weight: 700;
		padding: 7px 12px;
		border-radius: 999px;
		background: rgba(52, 211, 153, 0.15);
		color: #047857;
		border: 1px solid rgba(52, 211, 153, 0.35);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #10b981;
		box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6);
		animation: ping 1.6s ease infinite;
	}
	@keyframes ping {
		0% {
			box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55);
		}
		70% {
			box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
		}
		100% {
			box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
		}
	}

	.dialog {
		position: relative;
		border-radius: 28px;
		padding: 2px;
		background: linear-gradient(
			130deg,
			rgba(124, 92, 255, 0.85),
			rgba(255, 77, 141, 0.75),
			rgba(34, 211, 238, 0.7),
			rgba(251, 191, 36, 0.75)
		);
		background-size: 300% 300%;
		animation: borderShift 8s ease infinite;
		box-shadow:
			0 24px 60px rgba(124, 92, 255, 0.22),
			0 8px 24px rgba(255, 77, 141, 0.12);
	}
	@keyframes borderShift {
		0%,
		100% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
	}
	.dialog-inner {
		position: relative;
		border-radius: 26px;
		background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 255, 0.94));
		padding: 22px 18px 18px;
		backdrop-filter: blur(18px);
	}
	.dialog-kicker {
		display: inline-block;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #fff;
		background: linear-gradient(120deg, #7c5cff, #ff4d8d);
		padding: 5px 10px;
		border-radius: 999px;
		margin-bottom: 10px;
	}
	.dialog-inner h2 {
		font-size: clamp(1.25rem, 4.2vw, 1.55rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		margin: 0 0 8px;
		line-height: 1.25;
	}
	.dialog-sub {
		color: var(--cw-muted);
		font-size: 0.92rem;
		line-height: 1.5;
		margin: 0 0 16px;
	}

	.err {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #b91c1c;
		padding: 10px 12px;
		border-radius: 12px;
		font-size: 0.88rem;
		margin-bottom: 12px;
	}

	.composer {
		background: #fff;
		border: 1px solid var(--cw-border);
		border-radius: 20px;
		padding: 12px;
		box-shadow: 0 10px 28px rgba(15, 23, 42, 0.05);
		margin-bottom: 12px;
	}
	.concern-input {
		width: 100%;
		border: 0;
		resize: vertical;
		min-height: 110px;
		font: inherit;
		font-size: 16px;
		line-height: 1.5;
		color: var(--cw-ink);
		background: transparent;
		outline: none;
	}
	.composer-tools {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		justify-content: space-between;
		margin-top: 8px;
		padding-top: 10px;
		border-top: 1px dashed rgba(148, 163, 184, 0.35);
	}
	.tool-group {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.tool-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		border: 1px solid var(--cw-border);
		background: #f8fafc;
		color: var(--cw-ink);
		font-weight: 700;
		font-size: 0.82rem;
		padding: 10px 12px;
		border-radius: 12px;
		cursor: pointer;
		min-height: 42px;
		transition: transform 0.12s ease, box-shadow 0.12s ease;
	}
	.tool-btn:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
	}
	.tool-btn.mic {
		background: linear-gradient(135deg, #ede9fe, #fae8ff);
		border-color: rgba(124, 92, 255, 0.35);
		color: #5b21b6;
	}
	.tool-btn.photo {
		background: linear-gradient(135deg, #ecfeff, #e0f2fe);
		border-color: rgba(14, 165, 233, 0.35);
		color: #0369a1;
	}
	.tool-btn.photo input {
		display: none;
	}
	.tool-btn.danger {
		background: #fef2f2;
		border-color: #fecaca;
		color: #b91c1c;
	}
	.tool-btn.ok {
		background: #ecfdf5;
		border-color: #a7f3d0;
		color: #047857;
	}
	.tool-btn.pulse {
		animation: pulse 1s ease infinite;
	}
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.65;
		}
	}
	.type-select {
		border: 1px solid var(--cw-border);
		border-radius: 12px;
		padding: 10px 12px;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		background: #fff;
		color: var(--cw-ink);
		min-height: 42px;
	}
	.voice-bar {
		width: 100%;
		margin-top: 10px;
	}
	.thumbs {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 10px;
	}
	.thumb {
		position: relative;
		width: 72px;
		height: 72px;
		border-radius: 14px;
		overflow: hidden;
		box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.thumb-x {
		position: absolute;
		top: 2px;
		right: 2px;
		width: 22px;
		height: 22px;
		border: 0;
		border-radius: 50%;
		background: rgba(15, 23, 42, 0.7);
		color: #fff;
		cursor: pointer;
		font-size: 14px;
		line-height: 1;
	}

	.contact-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		border: 0;
		background: transparent;
		color: var(--cw-muted);
		font-weight: 700;
		font-size: 0.88rem;
		padding: 8px 4px 12px;
		cursor: pointer;
		text-align: left;
	}
	.loc-pill {
		margin-left: auto;
		font-size: 0.72rem;
		padding: 4px 8px;
		border-radius: 999px;
		background: #fef3c7;
		color: #b45309;
		border: 1px solid #fde68a;
	}
	.loc-pill.ok {
		background: #ecfdf5;
		color: #047857;
		border-color: #a7f3d0;
	}
	.contact-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-bottom: 14px;
	}
	.contact-grid label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--cw-muted);
	}
	.contact-grid label.full,
	.loc-row.full {
		grid-column: 1 / -1;
	}
	.contact-grid input {
		border: 1px solid var(--cw-border);
		border-radius: 12px;
		padding: 11px 12px;
		font: inherit;
		font-size: 16px;
		background: #fff;
		color: var(--cw-ink);
	}
	.loc-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		padding: 10px;
		border-radius: 14px;
		background: rgba(124, 92, 255, 0.06);
		border: 1px solid rgba(124, 92, 255, 0.15);
	}
	.loc-text {
		flex: 1 1 100%;
		font-size: 0.82rem;
		color: var(--cw-muted);
		font-weight: 600;
	}

	.btn-glow {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		min-height: 52px;
		border: 0;
		border-radius: 16px;
		font-weight: 800;
		font-size: 1.02rem;
		color: #fff;
		cursor: pointer;
		text-decoration: none;
		background: linear-gradient(120deg, #7c5cff, #ff4d8d 55%, #f59e0b);
		background-size: 200% 200%;
		animation: borderShift 6s ease infinite;
		box-shadow:
			0 12px 28px rgba(124, 92, 255, 0.35),
			0 0 0 1px rgba(255, 255, 255, 0.25) inset;
		transition: transform 0.12s ease, filter 0.12s ease;
	}
	.btn-glow:hover:not(:disabled) {
		transform: translateY(-2px);
		filter: brightness(1.05);
	}
	.btn-glow:disabled {
		opacity: 0.7;
		cursor: wait;
	}
	.btn-soft {
		border: 1px solid var(--cw-border);
		background: #fff;
		color: var(--cw-ink);
		font-weight: 700;
		border-radius: 12px;
		padding: 10px 14px;
		cursor: pointer;
		min-height: 42px;
	}
	.btn-soft.sm {
		padding: 8px 10px;
		font-size: 0.78rem;
		min-height: 36px;
	}
	.submit {
		margin-top: 4px;
	}
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-top-color: #fff;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.fineprint {
		text-align: center;
		font-size: 0.75rem;
		color: var(--cw-muted);
		margin: 12px 0 0;
		line-height: 1.4;
	}

	.features {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		margin-top: 16px;
	}
	.feat {
		background: rgba(255, 255, 255, 0.72);
		border: 1px solid var(--cw-border);
		border-radius: 16px;
		padding: 12px 8px;
		text-align: center;
		box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
	}
	.feat span {
		font-size: 1.25rem;
		display: block;
		margin-bottom: 4px;
	}
	.feat strong {
		display: block;
		font-size: 0.78rem;
		font-weight: 800;
	}
	.feat p {
		margin: 2px 0 0;
		font-size: 0.68rem;
		color: var(--cw-muted);
	}

	.success-dialog {
		text-align: center;
		padding: 28px 18px;
		background: linear-gradient(180deg, #fff, #f0fdf4);
		border-radius: 28px;
		border: 1px solid rgba(52, 211, 153, 0.35);
		box-shadow: 0 24px 50px rgba(16, 185, 129, 0.18);
	}
	.success-burst {
		width: 64px;
		height: 64px;
		margin: 0 auto 12px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 1.8rem;
		font-weight: 800;
		color: #059669;
		background: radial-gradient(circle at 30% 30%, #a7f3d0, #34d399);
		box-shadow: 0 0 0 8px rgba(52, 211, 153, 0.2);
	}
	.success-dialog h2 {
		margin: 0 0 8px;
		font-size: 1.4rem;
	}
	.success-dialog p {
		color: var(--cw-muted);
		margin: 0 0 8px;
	}
	.code-label {
		font-size: 0.8rem !important;
		margin-top: 12px !important;
	}
	.code {
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 1.45rem !important;
		font-weight: 800;
		color: #7c5cff !important;
		letter-spacing: 0.04em;
		margin-bottom: 18px !important;
	}
	.btn-row {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	@media (max-width: 420px) {
		.features {
			grid-template-columns: repeat(2, 1fr);
		}
		.contact-grid {
			grid-template-columns: 1fr;
		}
		.dialog-inner {
			padding: 18px 14px 16px;
		}
	}

	@media (min-width: 700px) {
		.cw {
			max-width: 600px;
			padding-top: 16px;
		}
		.dialog-inner {
			padding: 28px 26px 22px;
		}
	}

	/* Force light theme when on cow page body context via container */
	:global(body:has(.cw)) {
		background: #f4f7ff !important;
	}
	:global(.cow-container) {
		max-width: 720px !important;
	}
	:global(.cow-container .header) {
		border-bottom-color: rgba(148, 163, 184, 0.2);
	}
	:global(.cow-container .brand h1),
	:global(.cow-container .brand p),
	:global(.cow-container footer) {
		color: #0f172a;
	}
	:global(.cow-container footer) {
		opacity: 0.65;
	}
</style>
