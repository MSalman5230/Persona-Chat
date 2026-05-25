<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import AuthPage from '$lib/components/auth/AuthPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let email = $state('');
	let password = $state('');
	let pending = $state(false);
	let errorText = $state('');

	function nameFromEmail(value: string): string {
		const localPart = value.split('@')[0]?.trim();
		return localPart || 'Persona user';
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;

		pending = true;
		errorText = '';

		const result = await authClient.signUp.email({
			name: nameFromEmail(email),
			email,
			password,
			callbackURL: data.redirectTo
		});

		pending = false;
		if (result.error) {
			errorText = result.error.message ?? 'Unable to create account';
			return;
		}

		await goto(resolve(data.redirectTo as '/'));
	}

	async function signUpWithGoogle() {
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
	<title>Sign up - Persona</title>
</svelte:head>

<AuthPage
	mode="signup"
	googleAuthEnabled={data.googleAuthEnabled}
	redirectTo={data.redirectTo}
	bind:email
	bind:password
	{pending}
	{errorText}
	onSubmit={submit}
	onGoogle={signUpWithGoogle}
/>
