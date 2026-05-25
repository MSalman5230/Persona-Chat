<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let email = $state('');
	let password = $state('');
	let pending = $state(false);
	let errorText = $state('');

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;

		pending = true;
		errorText = '';

		const result = await authClient.signIn.email({
			email,
			password,
			callbackURL: data.redirectTo
		});

		pending = false;
		if (result.error) {
			errorText = result.error.message ?? 'Unable to sign in';
			return;
		}

		await goto(resolve(data.redirectTo as '/'));
	}

	async function signInWithGoogle() {
		if (!data.googleAuthEnabled || pending) return;
		pending = true;
		errorText = '';
		const result = await authClient.signIn.social({
			provider: 'google',
			callbackURL: data.redirectTo
		});
		if (result.error) {
			pending = false;
			errorText = result.error.message ?? 'Unable to continue with Google';
		}
	}
</script>

<svelte:head>
	<title>Sign in - Persona</title>
</svelte:head>

<main class="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-text-primary">
	<section class="w-full max-w-[28rem] rounded-lg border border-border-subtle bg-surface-container-low p-5">
		<div class="mb-5">
			<h1 class="font-headline-md text-headline-md text-primary">Sign in</h1>
			<p class="mt-1 font-body-sm text-body-sm text-text-muted">Use your Persona account.</p>
		</div>

		{#if errorText}
			<div class="mb-4 rounded-lg border border-error-container bg-error-container/25 px-3 py-2 font-body-sm text-body-sm text-error">
				{errorText}
			</div>
		{/if}

		<form class="space-y-3" onsubmit={submit}>
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
					autocomplete="current-password"
					bind:value={password}
					required
				/>
			</label>
			<button
				class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-body-sm text-body-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
				disabled={pending}
			>
				<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">login</span>
				<span>{pending ? 'Signing in' : 'Sign in'}</span>
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
			disabled={!data.googleAuthEnabled || pending}
			title={data.googleAuthEnabled ? 'Continue with Google' : 'Google login is not configured'}
			onclick={signInWithGoogle}
		>
			<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">account_circle</span>
			<span>Continue with Google</span>
		</button>

		<p class="mt-5 text-center font-body-sm text-body-sm text-text-muted">
			Need an account?
			<a class="text-primary underline-offset-4 hover:underline" href={resolve(`/signup?redirectTo=${encodeURIComponent(data.redirectTo)}`)}>
				Sign up
			</a>
		</p>
	</section>
</main>
