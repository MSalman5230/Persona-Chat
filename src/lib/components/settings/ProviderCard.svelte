<script lang="ts">
	import {
		PROVIDER_KINDS,
		THINKING_LEVELS,
		defaultModelValue,
		hasModel,
		providerModelOptions,
		type SavedProviderOption,
		type SupportedProviderOption
	} from '$lib/client/settings';

	interface Props {
		provider: SavedProviderOption;
		supportedProviders: SupportedProviderOption[];
	}

	let { provider, supportedProviders }: Props = $props();
	const modelOptions = $derived(providerModelOptions(provider, supportedProviders));
</script>

<div class="rounded-lg border border-border-subtle bg-surface-container-low p-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<div class="flex items-center gap-2">
				<h2 class="font-body-md text-body-md font-semibold text-primary">{provider.name}</h2>
				{#if provider.isDefault}
					<span class="rounded border border-outline-variant px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
						Default
					</span>
				{/if}
			</div>
			<p class="mt-1 font-code text-code text-text-muted">
				{provider.providerId}/{provider.defaultModel}
			</p>
		</div>
		<div class="flex items-center gap-2">
			<form method="POST" action="?/testProvider">
				<input type="hidden" name="id" value={provider.id} />
				<button
					class="rounded-lg border border-border-subtle p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
					aria-label="Test provider"
				>
					<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">
						network_check
					</span>
				</button>
			</form>
			<form method="POST" action="?/deleteProvider">
				<input type="hidden" name="id" value={provider.id} />
				<button
					class="rounded-lg border border-border-subtle p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-error"
					aria-label="Delete provider"
				>
					<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">
						delete
					</span>
				</button>
			</form>
		</div>
	</div>
	<form class="mt-4 grid gap-3 sm:grid-cols-2" method="POST" action="?/saveProvider">
		<input type="hidden" name="id" value={provider.id} />
		<label class="space-y-1">
			<span class="font-label-md text-label-md uppercase text-text-muted">Name</span>
			<input class="settings-field" name="name" value={provider.name} />
		</label>
		<label class="space-y-1">
			<span class="font-label-md text-label-md uppercase text-text-muted">Provider ID</span>
			<input class="settings-field" name="providerId" value={provider.providerId} />
		</label>
		<label class="space-y-1">
			<span class="font-label-md text-label-md uppercase text-text-muted">Kind</span>
			<select class="settings-field" name="kind" value={provider.kind}>
				{#each PROVIDER_KINDS as kind (kind.value)}
					<option value={kind.value}>{kind.label}</option>
				{/each}
			</select>
		</label>
		<label class="space-y-1">
			<span class="font-label-md text-label-md uppercase text-text-muted">API</span>
			<input class="settings-field" name="api" value={provider.api} />
		</label>
		<label class="space-y-1 sm:col-span-2">
			<span class="font-label-md text-label-md uppercase text-text-muted">Base URL</span>
			<input class="settings-field" name="baseUrl" value={provider.baseUrl ?? ''} />
		</label>
		<label class="space-y-1">
			<span class="font-label-md text-label-md uppercase text-text-muted">Default Model</span>
			<select class="settings-field" name="defaultModel" value={defaultModelValue(provider, modelOptions)}>
				{#if provider.defaultModel && !hasModel(modelOptions, provider.defaultModel)}
					<option value={provider.defaultModel}>{provider.defaultModel}</option>
				{/if}
				{#each modelOptions as model (model.id)}
					<option value={model.id}>{model.name}</option>
				{/each}
			</select>
		</label>
		<label class="space-y-1">
			<span class="font-label-md text-label-md uppercase text-text-muted">Thinking</span>
			<select class="settings-field" name="defaultThinkingLevel" value={provider.defaultThinkingLevel}>
				{#each THINKING_LEVELS as level (level)}
					<option value={level}>{level}</option>
				{/each}
			</select>
		</label>
		<div class="space-y-2 sm:col-span-2">
			<span class="font-label-md text-label-md uppercase text-text-muted">Models</span>
			{#if modelOptions.length > 0}
				<div class="settings-model-list">
					{#each modelOptions as model (model.id)}
						<label class="settings-model-favorite">
							<input
								class="settings-model-favorite-input"
								type="checkbox"
								name="favoriteModels"
								value={model.id}
								checked={provider.favoriteModels.includes(model.id)}
							/>
							<span class="settings-favorite-toggle" aria-hidden="true">
								<span class="material-symbols-outlined settings-favorite-icon">star</span>
							</span>
							<span class="settings-model-name">{model.name}</span>
							{#if model.id === provider.defaultModel}
								<span class="settings-model-badge">Default</span>
							{/if}
						</label>
					{/each}
				</div>
			{:else}
				<div class="rounded-lg border border-border-subtle bg-surface-container p-3 text-text-muted">
					No models configured.
				</div>
			{/if}
			{#if provider.kind === 'custom'}
				<textarea class="settings-field min-h-20" name="models" value={provider.models.join('\n')}></textarea>
			{/if}
		</div>
		<label class="space-y-1 sm:col-span-2">
			<span class="font-label-md text-label-md uppercase text-text-muted">New API Key</span>
			<input class="settings-field" name="apiKey" type="password" autocomplete="off" placeholder={provider.hasApiKey ? 'Saved' : ''} />
		</label>
		<div class="flex flex-wrap gap-4 sm:col-span-2">
			<label class="settings-toggle">
				<input type="checkbox" name="enabled" checked={provider.enabled} />
				<span>Enabled</span>
			</label>
			<label class="settings-toggle">
				<input type="checkbox" name="isDefault" checked={provider.isDefault} />
				<span>Default</span>
			</label>
			<label class="settings-toggle">
				<input type="checkbox" name="authHeader" checked={provider.authHeader} />
				<span>Auth header</span>
			</label>
		</div>
		<div class="flex justify-end sm:col-span-2">
			<button class="settings-primary-button">Save</button>
		</div>
	</form>
</div>
