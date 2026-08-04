import { browser } from '$app/environment';
import { writable, derived } from 'svelte/store';

const STORAGE_KEY = 'js_lang';

/** @typedef {'en' | 'or'} Lang */

/** Citizen / concern-raiser strings (Odia + English). Admin stays English. */
export const messages = {
	en: {
		langName: 'English',
		brand: 'Janasadharana',
		brandSub: 'Puri Municipality · Grievance Redressal',
		navHome: 'Home',
		navTrack: 'Track',
		navCow: 'Cow Welfare',
		navLogin: 'Login',
		navRegister: 'Register',
		navSubmit: 'Submit',
		navMy: 'My tickets',
		navOps: 'Operations',
		navLogout: 'Logout',
		footer: 'Puri Municipality · Built for citizens · Cow Welfare Unit (20 km)',

		// Home
		homeTitle: 'Community grievances',
		homeSub:
			'Report civic issues within Puri Municipality. Track progress publicly. One person, one upvote.',
		cowBannerTitle: '🐄 Cow Welfare Unit',
		cowBannerBody:
			'See an injured or unwell cow/ox near Puri? Report it in under a minute — text, photo, or voice.',
		cowBannerCta: 'Report animal concern',

		// Cow welfare wizard
		cowStep1Title: 'Help an animal in need',
		cowStep1Lead:
			'If you see a cow, ox, bull, or calf that is injured, unwell, or stranded within ~20 km of Puri, you can report it right away.',
		cowStep1How: 'How it works',
		cowStep1Bullet1: 'Share a short note of what you see (text)',
		cowStep1Bullet2: 'Optionally add a photo of the animal',
		cowStep1Bullet3: 'Or record a short voice message',
		cowStep1Bullet4: 'We use your exact GPS so ground staff can reach the spot',
		cowStep1Privacy:
			'Your name and phone help our team call you if they cannot find the animal. Location is required.',
		cowContinue: 'I want to report',
		cowBack: 'Back',
		cowNext: 'Continue',
		cowSubmit: 'Submit concern',
		cowSubmitting: 'Sending…',

		cowStep2Title: 'Your details',
		cowStep2Lead: 'So our cow welfare team can follow up if needed.',
		cowName: 'Your name',
		cowPhone: 'Mobile number',
		cowPhoneHint: '10-digit Indian mobile',
		cowLocation: 'Your location (required)',
		cowLocPending: 'Location not shared yet',
		cowLocOk: 'Location captured',
		cowLocNeed: 'Please allow location access. Reports only work inside the Puri 20 km zone.',
		cowShareLocation: 'Share my location',
		cowLocating: 'Getting GPS…',
		cowLocDenied: 'Location permission denied. Enable GPS for this site and try again.',
		cowLocError: 'Unable to get location. Check GPS and try again.',
		cowDemoLoc: 'Use Puri centre (demo)',

		cowStep3Title: 'Concern details',
		cowStep3Lead: 'Tell our ground staff what they will find.',
		cowAnimal: 'Animal',
		cowCondition: 'Condition',
		cowDescribe: 'Describe what you see',
		cowDescribePh: 'e.g. Cow lying near temple gate, left leg injured, cannot stand…',
		cowLandmark: 'Nearby landmark (optional)',
		cowLandmarkPh: 'Temple / shop / road name',
		cowPhoto: 'Photo (optional)',
		cowPhotoPick: 'Take or choose photo',
		cowPhotoClear: 'Remove photo',
		cowVoice: 'Voice note (optional)',
		cowVoiceStart: 'Record voice',
		cowVoiceStop: 'Stop recording',
		cowVoiceClear: 'Remove voice',
		cowVoiceRecording: 'Recording… tap Stop when done',
		cowVoiceReady: 'Voice note ready',
		cowNeedMedia: 'Add at least a short description (photo/voice optional).',
		cowSuccessTitle: 'Concern registered',
		cowSuccessBody: 'Thank you. Our cow welfare team has been notified.',
		cowTracking: 'Your tracking code',
		cowTrackBtn: 'Track status',
		cowAnother: 'Report another',

		animal_cow: 'Cow',
		animal_ox: 'Ox',
		animal_bull: 'Bull',
		animal_calf: 'Calf',
		animal_buffalo: 'Buffalo',
		animal_other: 'Other',

		cond_injured: 'Injured',
		cond_unwell: 'Unwell / sick',
		cond_stranded: 'Stranded / stuck',
		cond_hit_by_vehicle: 'Hit by vehicle',
		cond_malnourished: 'Malnourished',
		cond_other: 'Other',

		trackTitle: 'Track concern',
		trackSub: 'Enter the tracking code (PUR-…).',
		trackBtn: 'Track',
		trackSearching: 'Searching…'
	},
	or: {
		langName: 'ଓଡ଼ିଆ',
		brand: 'ଜନସାଧାରଣ',
		brandSub: 'ପୁରୀ ପୌରପାଳିକା · ଅଭିଯୋଗ ନିବାରଣ',
		navHome: 'ମୂଳ ପୃଷ୍ଠା',
		navTrack: 'ଟ୍ରାକ୍',
		navCow: 'ଗୋ-କଲ୍ୟାଣ',
		navLogin: 'ଲଗଇନ୍',
		navRegister: 'ପଞ୍ଜୀକରଣ',
		navSubmit: 'ଦାଖଲ',
		navMy: 'ମୋ ଟିକେଟ୍',
		navOps: 'ପରିଚାଳନା',
		navLogout: 'ଲଗଆଉଟ୍',
		footer: 'ପୁରୀ ପୌରପାଳିକା · ନାଗରିକଙ୍କ ପାଇଁ · ଗୋ-କଲ୍ୟାଣ ଏକକ (୨୦ କିମି)',

		homeTitle: 'ସାମୁହିକ ଅଭିଯୋଗ',
		homeSub:
			'ପୁରୀ ପୌରପାଳିକା ଭିତରେ ନାଗରିକ ସମସ୍ୟା ରିପୋର୍ଟ କରନ୍ତୁ। ସାର୍ବଜନୀନ ଭାବେ ଅଗ୍ରଗତି ଦେଖନ୍ତୁ।',
		cowBannerTitle: '🐄 ଗୋ-କଲ୍ୟାଣ ଏକକ',
		cowBannerBody:
			'ପୁରୀ ନିକଟରେ ଆହତ କିମ୍ବା ଅସୁସ୍ଥ ଗାଈ/ବଳଦ ଦେଖିଲେ? ଟେକ୍ସଟ୍, ଫଟୋ କିମ୍ବା ଭଏସ୍ ରେ ରିପୋର୍ଟ କରନ୍ତୁ।',
		cowBannerCta: 'ପଶୁ ସମସ୍ୟା ଜଣାନ୍ତୁ',

		cowStep1Title: 'ଆବଶ୍ୟକ ପଶୁଙ୍କୁ ସାହାଯ୍ୟ କରନ୍ତୁ',
		cowStep1Lead:
			'ପୁରୀର ~୨୦ କିମି ଭିତରେ ଆହତ, ଅସୁସ୍ଥ କିମ୍ବା ଫସିଯାଇଥିବା ଗାଈ, ବଳଦ, ଷଣ୍ଢ କିମ୍ବା ବାଛୁରୀ ଦେଖିଲେ ତୁରନ୍ତ ଜଣାନ୍ତୁ।',
		cowStep1How: 'କିପରି କାମ କରେ',
		cowStep1Bullet1: 'ଆପଣ ଯାହା ଦେଖୁଛନ୍ତି ସଂକ୍ଷିପ୍ତ ଟେକ୍ସଟ୍ ଲେଖନ୍ତୁ',
		cowStep1Bullet2: 'ଇଚ୍ଛାନୁସାରେ ପଶୁର ଫଟୋ ଯୋଡ଼ନ୍ତୁ',
		cowStep1Bullet3: 'କିମ୍ବା ଛୋଟ ଭଏସ୍ ମେସେଜ୍ ରେକର୍ଡ କରନ୍ତୁ',
		cowStep1Bullet4: 'ସଠିକ୍ GPS ଲୋକେସନ୍ ରେ ଗ୍ରାଉଣ୍ଡ ଷ୍ଟାଫ୍ ପହଞ୍ଚିବେ',
		cowStep1Privacy:
			'ଆପଣଙ୍କ ନାମ ଓ ଫୋନ୍ ନମ୍ବର ଆବଶ୍ୟକ ହେଲେ ଯୋଗାଯୋଗ ପାଇଁ। ଲୋକେସନ୍ ବାଧ୍ୟତାମୂଳକ।',
		cowContinue: 'ମୁଁ ରିପୋର୍ଟ କରିବି',
		cowBack: 'ପଛକୁ',
		cowNext: 'ଆଗକୁ',
		cowSubmit: 'ସମସ୍ୟା ଦାଖଲ କରନ୍ତୁ',
		cowSubmitting: 'ପଠାଯାଉଛି…',

		cowStep2Title: 'ଆପଣଙ୍କ ବିବରଣୀ',
		cowStep2Lead: 'ଗୋ-କଲ୍ୟାଣ ଦଳ ଆବଶ୍ୟକ ହେଲେ ଯୋଗାଯୋଗ କରିପାରିବ।',
		cowName: 'ଆପଣଙ୍କ ନାମ',
		cowPhone: 'ମୋବାଇଲ୍ ନମ୍ବର',
		cowPhoneHint: '୧୦ ଅଙ୍କର ଭାରତୀୟ ମୋବାଇଲ୍',
		cowLocation: 'ଆପଣଙ୍କ ଲୋକେସନ୍ (ବାଧ୍ୟତାମୂଳକ)',
		cowLocPending: 'ଲୋକେସନ୍ ଏପର୍ଯ୍ୟନ୍ତ ଦିଆଯାଇନାହିଁ',
		cowLocOk: 'ଲୋକେସନ୍ ମିଳିଲା',
		cowLocNeed: 'ଦୟାକରି ଲୋକେସନ୍ ଅନୁମତି ଦିଅନ୍ତୁ। କେବଳ ପୁରୀ ୨୦ କିମି ଭିତରେ ରିପୋର୍ଟ ହେବ।',
		cowShareLocation: 'ମୋ ଲୋକେସନ୍ ଦିଅନ୍ତୁ',
		cowLocating: 'GPS ନେଉଛି…',
		cowLocDenied: 'ଲୋକେସନ୍ ଅନୁମତି ନାକଚ। GPS ଚାଲୁ କରି ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ।',
		cowLocError: 'ଲୋକେସନ୍ ମିଳିଲା ନାହିଁ। GPS ଯାଞ୍ଚ କରନ୍ତୁ।',
		cowDemoLoc: 'ପୁରୀ କେନ୍ଦ୍ର (ଡେମୋ)',

		cowStep3Title: 'ସମସ୍ୟାର ବିବରଣୀ',
		cowStep3Lead: 'ଗ୍ରାଉଣ୍ଡ ଷ୍ଟାଫ୍‌ଙ୍କୁ କ’ଣ ମିଳିବ ଜଣାନ୍ତୁ।',
		cowAnimal: 'ପଶୁ',
		cowCondition: 'ଅବସ୍ଥା',
		cowDescribe: 'ଆପଣ ଯାହା ଦେଖୁଛନ୍ତି ଲେଖନ୍ତୁ',
		cowDescribePh: 'ଉଦାହରଣ: ମନ୍ଦିର ଦ୍ୱାର ପାଖରେ ଗାଈ, ବାମ ଗୋଡ଼ ଆହତ…',
		cowLandmark: 'ନିକଟସ୍ଥ ଚିହ୍ନ (ଇଚ୍ଛାଧୀନ)',
		cowLandmarkPh: 'ମନ୍ଦିର / ଦୋକାନ / ରାସ୍ତା',
		cowPhoto: 'ଫଟୋ (ଇଚ୍ଛାଧୀନ)',
		cowPhotoPick: 'ଫଟୋ ନିଅନ୍ତୁ କିମ୍ବା ବାଛନ୍ତୁ',
		cowPhotoClear: 'ଫଟୋ ହଟାନ୍ତୁ',
		cowVoice: 'ଭଏସ୍ ନୋଟ୍ (ଇଚ୍ଛାଧୀନ)',
		cowVoiceStart: 'ଭଏସ୍ ରେକର୍ଡ',
		cowVoiceStop: 'ରେକର୍ଡ ବନ୍ଦ',
		cowVoiceClear: 'ଭଏସ୍ ହଟାନ୍ତୁ',
		cowVoiceRecording: 'ରେକର୍ଡ ହେଉଛି… ଶେଷରେ Stop ଦବାନ୍ତୁ',
		cowVoiceReady: 'ଭଏସ୍ ନୋଟ୍ ପ୍ରସ୍ତୁତ',
		cowNeedMedia: 'ଅତି କମରେ ସଂକ୍ଷିପ୍ତ ବର୍ଣ୍ଣନା ଲେଖନ୍ତୁ (ଫଟୋ/ଭଏସ୍ ଇଚ୍ଛାଧୀନ)।',
		cowSuccessTitle: 'ସମସ୍ୟା ପଞ୍ଜୀକୃତ',
		cowSuccessBody: 'ଧନ୍ୟବାଦ। ଆମ ଗୋ-କଲ୍ୟାଣ ଦଳକୁ ସୂଚନା ଦିଆଯାଇଛି।',
		cowTracking: 'ଆପଣଙ୍କ ଟ୍ରାକିଂ କୋଡ୍',
		cowTrackBtn: 'ସ୍ଥିତି ଦେଖନ୍ତୁ',
		cowAnother: 'ଆଉ ଗୋଟିଏ ରିପୋର୍ଟ',

		animal_cow: 'ଗାଈ',
		animal_ox: 'ବଳଦ',
		animal_bull: 'ଷଣ୍ଢ',
		animal_calf: 'ବାଛୁରୀ',
		animal_buffalo: 'ମଇଁଷି',
		animal_other: 'ଅନ୍ୟ',

		cond_injured: 'ଆହତ',
		cond_unwell: 'ଅସୁସ୍ଥ',
		cond_stranded: 'ଫସିଯାଇଛି',
		cond_hit_by_vehicle: 'ଯାନ ଧକ୍କା',
		cond_malnourished: 'ପୋଷଣହୀନ',
		cond_other: 'ଅନ୍ୟ',

		trackTitle: 'ଟ୍ରାକ୍ କରନ୍ତୁ',
		trackSub: 'ଟ୍ରାକିଂ କୋଡ୍ ଦିଅନ୍ତୁ (PUR-…)।',
		trackBtn: 'ଟ୍ରାକ୍',
		trackSearching: 'ଖୋଜୁଛି…'
	}
};

function initialLang() {
	if (!browser) return 'en';
	const saved = localStorage.getItem(STORAGE_KEY);
	if (saved === 'or' || saved === 'en') return saved;
	return 'en';
}

/** @type {import('svelte/store').Writable<Lang>} */
export const lang = writable(/** @type {Lang} */ (initialLang()));

if (browser) {
	lang.subscribe((v) => {
		try {
			localStorage.setItem(STORAGE_KEY, v);
			document.documentElement.lang = v === 'or' ? 'or' : 'en';
		} catch {
			/* ignore */
		}
	});
}

export const t = derived(lang, ($lang) => {
	const dict = messages[$lang] || messages.en;
	return (key) => dict[key] ?? messages.en[key] ?? key;
});

export function setLang(next) {
	if (next === 'en' || next === 'or') lang.set(next);
}

export function toggleLang() {
	lang.update((v) => (v === 'en' ? 'or' : 'en'));
}
