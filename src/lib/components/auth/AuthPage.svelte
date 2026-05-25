<script lang="ts">
	import { resolve } from '$app/paths';

	type AuthMode = 'login' | 'signup';

	interface Props {
		mode: AuthMode;
		googleAuthEnabled: boolean;
		redirectTo: string;
		email: string;
		password: string;
		pending: boolean;
		errorText: string;
		onSubmit: (event: SubmitEvent) => void | Promise<void>;
		onGoogle: () => void | Promise<void>;
	}

	let {
		mode,
		googleAuthEnabled,
		redirectTo,
		email = $bindable(''),
		password = $bindable(''),
		pending,
		errorText,
		onSubmit,
		onGoogle
	}: Props = $props();

	const isLogin = $derived(mode === 'login');
	const title = $derived(isLogin ? 'Sign in' : 'Sign up');
	const subtitle = $derived(isLogin ? 'Use your Persona account.' : 'Create your Persona account.');
	const submitIcon = $derived(isLogin ? 'login' : 'person_add');
	const submitLabel = $derived(isLogin ? 'Sign in' : 'Create account');
	const pendingLabel = $derived(isLogin ? 'Signing in' : 'Creating account');
	const passwordAutocomplete = $derived(isLogin ? 'current-password' : 'new-password');
	const footerPrompt = $derived(isLogin ? 'Need an account?' : 'Already have an account?');
	const footerPath = $derived(
		`/${isLogin ? 'signup' : 'login'}?redirectTo=${encodeURIComponent(redirectTo)}`
	);
	const footerLabel = $derived(isLogin ? 'Sign up' : 'Sign in');
</script>

<main class="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-text-primary">
	<section class="w-full max-w-[28rem] rounded-lg border border-border-subtle bg-surface-container-low p-5">
		<div class="mb-5">
			<h1 class="font-headline-md text-headline-md text-primary">{title}</h1>
			<p class="mt-1 font-body-sm text-body-sm text-text-muted">{subtitle}</p>
		</div>

		{#if errorText}
			<div class="mb-4 rounded-lg border border-error-container bg-error-container/25 px-3 py-2 font-body-sm text-body-sm text-error">
				{errorText}
			</div>
		{/if}

		<form class="space-y-3" onsubmit={onSubmit}>
			<label class="block space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">Email</span>
				<input
					class="w-full rounded-lg border border-border-subtle bg-surface-container px-3 py-2.5 font-body-sm text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-outline"
					type="email"
					autocomplete="email"
					bind:value={email}
					required
				/>
			</label>
			<label class="block space-y-1">
				<span class="font-label-md text-label-md uppercase text-text-muted">Password</span>
				<input
					class="w-full rounded-lg border border-border-subtle bg-surface-container px-3 py-2.5 font-body-sm text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-outline"
					type="password"
					autocomplete={passwordAutocomplete}
					bind:value={password}
					minlength={isLogin ? undefined : 8}
					required
				/>
			</label>
			<button
				class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-body-sm text-body-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
				disabled={pending}
			>
				<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">{submitIcon}</span>
				<span>{pending ? pendingLabel : submitLabel}</span>
			</button>
		</form>

		<div class="my-4 flex items-center gap-3 text-text-muted">
			<div class="h-px flex-1 bg-border-subtle"></div>
			<span class="font-label-md text-label-md uppercase">or</span>
			<div class="h-px flex-1 bg-border-subtle"></div>
		</div>

		<button
			type="button"
			class="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border-subtle px-4 py-2.5 font-body-sm text-body-sm text-primary transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:border-outline-variant disabled:text-text-muted disabled:opacity-50"
			disabled={!googleAuthEnabled || pending}
			title={googleAuthEnabled ? 'Continue with Google' : 'Google login is not configured'}
			onclick={onGoogle}
		>
			<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">account_circle</span>
			<span>Continue with Google</span>
		</button>

		<p class="mt-5 text-center font-body-sm text-body-sm text-text-muted">
			{footerPrompt}
			<a class="text-primary underline-offset-4 hover:underline" href={resolve(footerPath as '/')}>
				{footerLabel}
			</a>
		</p>
	</section>
</main>
