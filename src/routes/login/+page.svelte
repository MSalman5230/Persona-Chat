<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Mode = 'sign-in' | 'sign-up';

	let mode = $state<Mode>('sign-in');
	let email = $state('');
	let password = $state('');
	let name = $state('');
	let errorText = $state('');
	let loading = $state(false);
	let googleLoading = $state(false);

	const title = $derived(mode === 'sign-in' ? 'Welcome back' : 'Create your account');
	const submitLabel = $derived(mode === 'sign-in' ? 'Sign in' : 'Create account');
	const alternateLabel = $derived(
		mode === 'sign-in' ? 'Need an account?' : 'Already have an account?'
	);
	const alternateAction = $derived(mode === 'sign-in' ? 'Sign up' : 'Sign in');

	function authErrorMessage(error: unknown, fallback: string): string {
		if (error && typeof error === 'object' && 'message' in error) {
			const message = (error as { message?: unknown }).message;
			if (typeof message === 'string' && message) return message;
		}
		return fallback;
	}

	function toggleMode() {
		mode = mode === 'sign-in' ? 'sign-up' : 'sign-in';
		errorText = '';
	}

	async function finishEmailAuth(
		result: { error?: unknown },
		fallback: string
	): Promise<void> {
		if (result.error) {
			errorText = authErrorMessage(result.error, fallback);
			return;
		}
		await goto(resolve(data.redirectTo as '/'), { replaceState: true });
	}

	async function submitEmail(event: SubmitEvent) {
		event.preventDefault();
		if (loading) return;

		loading = true;
		errorText = '';

		try {
			if (mode === 'sign-in') {
				await finishEmailAuth(
					await authClient.signIn.email({
						email,
						password,
						callbackURL: data.redirectTo
					}),
					'Unable to sign in'
				);
			} else {
				await finishEmailAuth(
					await authClient.signUp.email({
						name: name.trim() || email,
						email,
						password,
						callbackURL: data.redirectTo
					}),
					'Unable to create account'
				);
			}
		} catch (error) {
			errorText = error instanceof Error ? error.message : 'Authentication failed';
		} finally {
			loading = false;
		}
	}

	async function signInWithGoogle() {
		if (!data.googleAuthEnabled || googleLoading) return;

		googleLoading = true;
		errorText = '';
		try {
			await authClient.signIn.social({
				provider: 'google',
				callbackURL: data.redirectTo
			});
		} catch (error) {
			googleLoading = false;
			errorText = error instanceof Error ? error.message : 'Google sign-in failed';
		}
	}
</script>

<svelte:head>
	<title>Sign in - Persona</title>
</svelte:head>

<main class="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-text-primary">
	<section class="w-full max-w-md rounded-lg border border-border-subtle bg-surface-container-low p-6">
		<div class="mb-6 flex items-center gap-3">
			<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-background">
				<span class="material-symbols-outlined filled !text-[21px]" aria-hidden="true">neurology</span>
			</div>
			<div>
				<h1 class="font-headline-md text-headline-md text-primary">{title}</h1>
				<p class="font-body-sm text-body-sm text-text-muted">Persona</p>
			</div>
		</div>

		{#if errorText}
			<div class="mb-4 rounded-lg border border-error-container bg-error-container/25 px-4 py-3 font-body-sm text-body-sm text-error">
				{errorText}
			</div>
		{/if}

		<form class="space-y-4" onsubmit={submitEmail}>
			{#if mode === 'sign-up'}
				<label class="block space-y-2">
					<span class="font-label-md text-label-md uppercase text-text-muted">Name</span>
					<input
						class="w-full rounded-lg border border-border-subtle bg-surface-container px-3 py-2.5 font-body-sm text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-outline"
						bind:value={name}
						autocomplete="name"
						placeholder="Your name"
					/>
				</label>
			{/if}

			<label class="block space-y-2">
				<span class="font-label-md text-label-md uppercase text-text-muted">Email</span>
				<input
					class="w-full rounded-lg border border-border-subtle bg-surface-container px-3 py-2.5 font-body-sm text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-outline"
					bind:value={email}
					type="email"
					autocomplete="email"
					placeholder="you@example.com"
					required
				/>
			</label>

			<label class="block space-y-2">
				<span class="font-label-md text-label-md uppercase text-text-muted">Password</span>
				<input
					class="w-full rounded-lg border border-border-subtle bg-surface-container px-3 py-2.5 font-body-sm text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-outline"
					bind:value={password}
					type="password"
					autocomplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
					placeholder="At least 8 characters"
					required
				/>
			</label>

			<button
				class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 font-body-sm text-body-sm font-medium text-background transition-colors hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-60"
				type="submit"
				disabled={loading}
			>
				<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">
					{mode === 'sign-in' ? 'login' : 'person_add'}
				</span>
				<span>{loading ? 'Working...' : submitLabel}</span>
			</button>
		</form>

		<div class="my-5 flex items-center gap-3 text-text-muted">
			<div class="h-px flex-1 bg-border-subtle"></div>
			<span class="font-label-md text-label-md uppercase">or</span>
			<div class="h-px flex-1 bg-border-subtle"></div>
		</div>

		<button
			type="button"
			class="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border-subtle px-4 font-body-sm text-body-sm font-medium text-text-primary transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:border-outline-variant disabled:bg-surface-container disabled:text-text-muted"
			disabled={!data.googleAuthEnabled || googleLoading}
			aria-disabled={!data.googleAuthEnabled || googleLoading}
			title={data.googleAuthEnabled ? 'Continue with Google' : 'Google sign-in is not configured'}
			onclick={signInWithGoogle}
		>
			<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">account_circle</span>
			<span>{googleLoading ? 'Opening Google...' : 'Continue with Google'}</span>
		</button>

		<div class="mt-5 flex items-center justify-center gap-2 font-body-sm text-body-sm text-text-muted">
			<span>{alternateLabel}</span>
			<button
				type="button"
				class="rounded-md px-1.5 py-1 text-primary transition-colors hover:bg-surface-container-high"
				onclick={toggleMode}
			>
				{alternateAction}
			</button>
		</div>
	</section>
</main>
