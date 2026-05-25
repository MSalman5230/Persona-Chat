<script lang="ts">
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
	import SelectField from '$lib/components/common/SelectField.svelte';
	import {
		defaultModelValue,
		hasModel,
		isCatalogBackedProvider,
		providerModelOptions,
		type SavedProviderOption,
		type SupportedProviderOption
	} from '$lib/client/settings';

	interface Props {
		provider: SavedProviderOption;
		supportedProviders: SupportedProviderOption[];
		canManage: boolean;
	}

	let { provider: connection, supportedProviders, canManage }: Props = $props();

	const catalogBacked = $derived(isCatalogBackedProvider(connection, supportedProviders));
	const modelOptions = $derived(providerModelOptions(connection, supportedProviders));
	const userDefaultModelOptions = $derived([
		...(connection.effective.defaultModel && !hasModel(modelOptions, connection.effective.defaultModel)
			? [{ value: connection.effective.defaultModel, label: connection.effective.defaultModel }]
			: []),
		...modelOptions.map((model) => ({ value: model.id, label: model.name }))
	]);
	const adminDefaultModelOptions = $derived([
		...(connection.provider.defaultModel && !hasModel(modelOptions, connection.provider.defaultModel)
			? [{ value: connection.provider.defaultModel, label: connection.provider.defaultModel }]
			: []),
		...modelOptions.map((model) => ({ value: model.id, label: model.name }))
	]);

	let deleteForm: HTMLFormElement | null = null;
	let deleteConfirmationOpen = $state(false);

	function requestDeleteProvider(event: SubmitEvent) {
		event.preventDefault();
		deleteForm = event.currentTarget as HTMLFormElement;
		deleteConfirmationOpen = true;
	}

	function cancelDeleteProvider() {
		deleteConfirmationOpen = false;
		deleteForm = null;
	}

	function confirmDeleteProvider() {
		const form = deleteForm;
		deleteConfirmationOpen = false;
		deleteForm = null;
		form?.submit();
	}
</script>

<div class="rounded-lg border border-border-subtle bg-surface-container-low p-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<div class="flex items-center gap-2">
				<h2 class="font-body-md text-body-md font-semibold text-primary">{connection.provider.name}</h2>
				{#if connection.effective.isDefault}
					<span class="rounded border border-outline-variant px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
						Your default
					</span>
				{/if}
				{#if canManage && connection.provider.isDefault}
					<span class="rounded border border-outline-variant px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
						Global default
					</span>
				{/if}
			</div>
			<p class="mt-1 font-code text-code text-text-muted">
				{connection.provider.providerId}/{connection.effective.defaultModel}
			</p>
		</div>

		{#if canManage}
			<div class="flex items-center gap-2">
				<form method="POST" action="?/testProvider">
					<input type="hidden" name="id" value={connection.provider.id} />
					<button
						class="rounded-lg border border-border-subtle p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
						aria-label="Test provider"
					>
						<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">
							network_check
						</span>
					</button>
				</form>
				<form method="POST" action="?/deleteProvider" onsubmit={requestDeleteProvider}>
					<input type="hidden" name="id" value={connection.provider.id} />
					<button
						class="rounded-lg border border-border-subtle p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-error"
						aria-label="Delete provider"
					>
						<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">delete</span>
					</button>
				</form>
			</div>
		{/if}
	</div>

	<form class="mt-4 grid gap-3 sm:grid-cols-2" method="POST" action="?/saveProviderPreference">
		<input type="hidden" name="id" value={connection.provider.id} />
		<label class="space-y-1">
			<span class="font-label-md text-label-md uppercase text-text-muted">Your Default Model</span>
			<SelectField
				name="defaultModel"
				value={defaultModelValue(connection, modelOptions)}
				options={userDefaultModelOptions}
			/>
		</label>
		<label class="mt-auto flex h-10 items-center gap-2 font-body-sm text-body-sm text-text-primary">
			<input
				type="checkbox"
				name="isDefault"
				class="h-4 w-4 accent-primary"
				checked={connection.effective.isDefault}
			/>
			<span>Your default provider</span>
		</label>

		<div class="space-y-2 sm:col-span-2">
			<span class="font-label-md text-label-md uppercase text-text-muted">Your Favorite Models</span>
			{#if modelOptions.length > 0}
				<div class="settings-model-list">
					{#each modelOptions as model (model.id)}
						<label class="settings-model-favorite">
							<input
								class="settings-model-favorite-input"
								type="checkbox"
								name="favoriteModels"
								value={model.id}
								checked={connection.effective.favoriteModels.includes(model.id)}
							/>
							<span class="settings-favorite-toggle" aria-hidden="true">
								<span class="material-symbols-outlined settings-favorite-icon">star</span>
							</span>
							<span class="settings-model-name">{model.name}</span>
							{#if model.id === connection.effective.defaultModel}
								<span class="settings-model-badge">Your default</span>
							{/if}
						</label>
					{/each}
				</div>
			{:else}
				<div class="rounded-lg border border-border-subtle bg-surface-container p-3 text-text-muted">
					No models configured.
				</div>
			{/if}
		</div>
		<div class="flex justify-end sm:col-span-2">
			<button class="settings-primary-button">Save Preferences</button>
		</div>
	</form>

	{#if canManage}
		<details class="settings-advanced mt-4">
			<summary>
				<span>Provider management</span>
				<span class="material-symbols-outlined" aria-hidden="true">expand_more</span>
			</summary>
			<form class="mt-4 grid gap-3 sm:grid-cols-2" method="POST" action="?/saveProvider">
				<input type="hidden" name="id" value={connection.provider.id} />
				{#if catalogBacked}
					<input type="hidden" name="providerId" value={connection.provider.providerId} />
				{/if}

				<label class="space-y-1">
					<span class="font-label-md text-label-md uppercase text-text-muted">Name</span>
					<input class="settings-field" name="name" value={connection.provider.name} />
				</label>
				<label class="space-y-1">
					<span class="font-label-md text-label-md uppercase text-text-muted">Global Default Model</span>
					<SelectField
						name="defaultModel"
						value={connection.provider.defaultModel}
						options={adminDefaultModelOptions}
					/>
				</label>
				<div class="space-y-2 sm:col-span-2">
					<span class="font-label-md text-label-md uppercase text-text-muted">Global Favorite Models</span>
					{#if modelOptions.length > 0}
						<div class="settings-model-list">
							{#each modelOptions as model (model.id)}
								<label class="settings-model-favorite">
									<input
										class="settings-model-favorite-input"
										type="checkbox"
										name="favoriteModels"
										value={model.id}
										checked={connection.provider.favoriteModels.includes(model.id)}
									/>
									<span class="settings-favorite-toggle" aria-hidden="true">
										<span class="material-symbols-outlined settings-favorite-icon">star</span>
									</span>
									<span class="settings-model-name">{model.name}</span>
									{#if model.id === connection.provider.defaultModel}
										<span class="settings-model-badge">Global default</span>
									{/if}
								</label>
							{/each}
						</div>
					{:else}
						<div class="rounded-lg border border-border-subtle bg-surface-container p-3 text-text-muted">
							No models configured.
						</div>
					{/if}
				</div>

				<div class="grid gap-3 sm:col-span-2 sm:grid-cols-2">
					<label class="space-y-1">
						<span class="font-label-md text-label-md uppercase text-text-muted">Provider ID</span>
						<input
							class="settings-field"
							name={catalogBacked ? undefined : 'providerId'}
							value={connection.provider.providerId}
							readonly={catalogBacked}
						/>
					</label>
					<label class="space-y-1">
						<span class="font-label-md text-label-md uppercase text-text-muted">API</span>
						<input
							class="settings-field"
							name={catalogBacked ? undefined : 'api'}
							value={connection.provider.api}
							readonly={catalogBacked}
						/>
					</label>
					<label class="space-y-1 sm:col-span-2">
						<span class="font-label-md text-label-md uppercase text-text-muted">Base URL</span>
						<input
							class="settings-field"
							name={catalogBacked ? undefined : 'baseUrl'}
							value={connection.provider.baseUrl ?? 'PI SDK default'}
							readonly={catalogBacked}
						/>
					</label>
					{#if !catalogBacked}
						<label class="space-y-1 sm:col-span-2">
							<span class="font-label-md text-label-md uppercase text-text-muted">Available Models</span>
							<textarea
								class="settings-field min-h-20"
								name="models"
								value={connection.provider.models.join('\n')}
							></textarea>
						</label>
						<label class="settings-toggle">
							<input type="checkbox" name="authHeader" checked={connection.provider.authHeader} />
							<span>Auth header</span>
						</label>
					{/if}
				</div>

				<label class="space-y-1 sm:col-span-2">
					<span class="font-label-md text-label-md uppercase text-text-muted">New API Key</span>
					<input
						class="settings-field"
						name="apiKey"
						type="password"
						autocomplete="off"
						placeholder={connection.provider.hasApiKey ? 'Saved' : ''}
					/>
				</label>
				<div class="flex flex-wrap gap-4 sm:col-span-2">
					<label class="settings-toggle">
						<input type="checkbox" name="enabled" checked={connection.provider.enabled} />
						<span>Enabled</span>
					</label>
					<label class="settings-toggle">
						<input type="checkbox" name="isDefault" checked={connection.provider.isDefault} />
						<span>Global default</span>
					</label>
				</div>
				<div class="flex justify-end sm:col-span-2">
					<button class="settings-primary-button">Save Provider</button>
				</div>
			</form>
		</details>
	{/if}

	{#if canManage}
		<ConfirmDialog
			open={deleteConfirmationOpen}
			title="Delete provider?"
			description={`Delete "${connection.provider.name}"? This removes its saved configuration.`}
			confirmLabel="Delete provider"
			variant="danger"
			onCancel={cancelDeleteProvider}
			onConfirm={confirmDeleteProvider}
		/>
	{/if}
</div>
