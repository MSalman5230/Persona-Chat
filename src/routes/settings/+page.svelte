<script lang="ts">
	import { getAppSidebarContext } from '$lib/components/chat/sidebar-context';
	import '$lib/components/settings/settings.css';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const sidebar = getAppSidebarContext();

	type Provider = (typeof data.providers)[number];

	function modelOptions(provider: Provider): string[] {
		const values: string[] = [];
		const add = (modelId: string) => {
			if (!modelId || values.includes(modelId)) return;
			values.push(modelId);
		};

		add(provider.defaultModel);
		for (const modelId of provider.models) add(modelId);
		return values;
	}
</script>

<svelte:head>
	<title>Settings - Persona</title>
</svelte:head>

<div class="custom-scrollbar h-dvh overflow-y-auto bg-background text-text-primary">
	<div class="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
		<header class="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-5">
			<div class="flex items-center gap-3">
				<button
					type="button"
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-container-low text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary md:hidden"
					aria-label="Open sidebar"
					onclick={sidebar.openSidebar}
				>
					<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">menu</span>
				</button>
				<div>
					<h1 class="font-headline-md text-headline-md text-primary">Settings</h1>
					<p class="font-body-sm text-body-sm text-text-muted">Personal defaults and models</p>
				</div>
			</div>
		</header>

		{#if form?.error}
			<div class="mb-4 rounded-lg border border-error-container bg-error-container/25 px-4 py-3 text-error">
				{form.error}
			</div>
		{:else if data.loadError}
			<div class="mb-4 rounded-lg border border-error-container bg-error-container/25 px-4 py-3 text-error">
				{data.loadError}
			</div>
		{:else if form?.message}
			<div class="mb-4 rounded-lg border border-outline-variant bg-surface-container-low px-4 py-3 text-text-primary">
				{form.message}
			</div>
		{/if}

		<form class="space-y-6" method="POST" action="?/saveSettings">
			<section class="rounded-lg border border-border-subtle bg-surface-container-low p-4">
				<div class="grid gap-4 md:grid-cols-2">
					<label class="block space-y-2">
						<span class="font-label-md text-label-md uppercase text-text-muted">Default Provider</span>
						<select class="settings-field" name="defaultProviderConnectionId">
							{#each data.providers as provider (provider.id)}
								<option value={provider.id} selected={provider.id === data.defaultProviderId}>
									{provider.name}
								</option>
							{/each}
						</select>
					</label>

					<label class="block space-y-2">
						<span class="font-label-md text-label-md uppercase text-text-muted">Default Thinking</span>
						<select class="settings-field" name="defaultThinkingLevel">
							<option value="" selected={data.defaultThinkingLevel === null}>Provider default</option>
							{#each data.thinkingLevels as level (level)}
								<option value={level} selected={level === data.defaultThinkingLevel}>{level}</option>
							{/each}
						</select>
					</label>
				</div>
			</section>

			<section class="space-y-4" aria-labelledby="models-heading">
				<div>
					<h2 id="models-heading" class="font-headline-md text-headline-md text-primary">Models</h2>
					<p class="font-body-sm text-body-sm text-text-muted">Favorite models appear in chat selectors.</p>
				</div>

				<div class="grid gap-4 lg:grid-cols-2">
					{#each data.providers as provider (provider.id)}
						{@const models = modelOptions(provider)}
						<section class="rounded-lg border border-border-subtle bg-surface-container-low p-4">
							<input type="hidden" name="providerId" value={provider.id} />
							<div class="mb-4 flex min-w-0 items-center gap-2">
								<span class="material-symbols-outlined !text-[18px] text-text-muted" aria-hidden="true">
									hub
								</span>
								<div class="min-w-0">
									<h3 class="truncate font-body-sm text-body-sm font-semibold text-primary">
										{provider.name}
									</h3>
									<p class="truncate font-code text-code text-text-muted">{provider.providerId}</p>
								</div>
							</div>

							<label class="mb-4 block space-y-2">
								<span class="font-label-md text-label-md uppercase text-text-muted">Default Model</span>
								<select class="settings-field" name={`defaultModel:${provider.id}`}>
									<option value="">Provider default</option>
									{#each models as model (model)}
										<option value={model} selected={model === provider.defaultModel}>{model}</option>
									{/each}
								</select>
							</label>

							<div class="settings-model-list">
								{#each models as model (model)}
									<label class="settings-model-favorite">
										<input
											class="settings-model-favorite-input"
											type="checkbox"
											name={`favoriteModels:${provider.id}`}
											value={model}
											checked={provider.favoriteModels.includes(model)}
										/>
										<span class="settings-favorite-toggle">
											<span class="material-symbols-outlined settings-favorite-icon" aria-hidden="true">
												check
											</span>
										</span>
										<span class="min-w-0 flex-1 truncate font-code text-code text-primary">{model}</span>
									</label>
								{/each}
							</div>
						</section>
					{:else}
						<div class="rounded-lg border border-border-subtle bg-surface-container-low p-6 text-text-muted">
							No providers are available.
						</div>
					{/each}
				</div>
			</section>

			<div class="flex justify-end border-t border-border-subtle pt-4">
				<button class="settings-primary-button inline-flex items-center gap-2" disabled={data.providers.length === 0}>
					<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">save</span>
					<span>Save Settings</span>
				</button>
			</div>
		</form>
	</div>
</div>
