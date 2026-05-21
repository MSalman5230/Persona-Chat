<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Tab = 'providers' | 'mcp';
	type SavedProvider = PageProps['data']['providers'][number];
	type SupportedProvider = PageProps['data']['supportedProviders'][number];
	type ModelOption = { id: string; name: string };

	let activeTab = $state<Tab>('providers');
	let selectedSupportedProviderId = $state<string | null>(null);
	let selectedDefaultModelOverride = $state<string | null>(null);

	const thinkingLevels = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];
	const providerKinds = [
		{ value: 'built_in', label: 'Built-in' },
		{ value: 'custom', label: 'Custom' }
	];
	const mcpJsonExample = `{
  "mcpServers": {
    "local_memory": {
      "name": "Local Memory",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {
        "MEMORY_FILE_PATH": "C:/tmp/memory.json"
      }
    },
    "remote_docs": {
      "name": "Remote Docs",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}`;
	const selectedProviderId = $derived(selectedSupportedProviderId ?? data.supportedProviders[0]?.id ?? '');
	const selectedSupportedProvider = $derived(
		data.supportedProviders.find((provider) => provider.id === selectedProviderId) ??
			data.supportedProviders[0]
	);
	const selectedSupportedModels = $derived(selectedSupportedProvider?.models ?? []);
	const selectedDefaultModel = $derived(
		selectedDefaultModelOverride ?? selectedSupportedProvider?.defaultModel ?? ''
	);

	function selectSupportedProvider(event: Event) {
		const providerId = (event.currentTarget as HTMLSelectElement).value;
		selectedSupportedProviderId = providerId;
		selectedDefaultModelOverride = null;
	}

	function selectDefaultModel(event: Event) {
		selectedDefaultModelOverride = (event.currentTarget as HTMLSelectElement).value;
	}

	function supportedProviderFor(providerId: string): SupportedProvider | undefined {
		return data.supportedProviders.find((provider) => provider.id === providerId);
	}

	function providerModelOptions(provider: SavedProvider): ModelOption[] {
		const supportedProvider =
			provider.kind === 'built_in' ? supportedProviderFor(provider.providerId) : undefined;
		if (supportedProvider) return supportedProvider.models;

		const modelIds = provider.models.length > 0 ? provider.models : [provider.defaultModel];
		return modelIds.filter(Boolean).map((modelId) => ({ id: modelId, name: modelId }));
	}

	function hasModel(options: ModelOption[], modelId: string): boolean {
		return options.some((model) => model.id === modelId);
	}

	function defaultModelValue(provider: SavedProvider, options: ModelOption[]): string {
		return hasModel(options, provider.defaultModel)
			? provider.defaultModel
			: (options[0]?.id ?? provider.defaultModel);
	}
</script>

<svelte:head>
	<title>Settings - Persona</title>
</svelte:head>

<div class="custom-scrollbar h-dvh overflow-y-auto bg-background text-text-primary">
	<div class="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
		<header class="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-5">
			<div class="flex items-center gap-3">
				<a
					href={resolve('/')}
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-container-low text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
					aria-label="Back to chat"
				>
					<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">arrow_back</span>
				</a>
				<div>
					<h1 class="font-headline-md text-headline-md text-primary">Settings</h1>
					<p class="font-body-sm text-body-sm text-text-muted">Providers and MCP servers</p>
				</div>
			</div>

			<div class="flex rounded-lg border border-border-subtle bg-surface-container-low p-1">
				<button
					type="button"
					class={[
						'rounded-md px-3 py-1.5 font-body-sm text-body-sm transition-colors',
						activeTab === 'providers'
							? 'bg-primary text-background'
							: 'text-text-muted hover:bg-surface-container-high hover:text-primary'
					]}
					onclick={() => (activeTab = 'providers')}
				>
					Providers
				</button>
				<button
					type="button"
					class={[
						'rounded-md px-3 py-1.5 font-body-sm text-body-sm transition-colors',
						activeTab === 'mcp'
							? 'bg-primary text-background'
							: 'text-text-muted hover:bg-surface-container-high hover:text-primary'
					]}
					onclick={() => (activeTab = 'mcp')}
				>
					MCP
				</button>
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

		{#if activeTab === 'providers'}
			<section class="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
				<div class="space-y-3">
					{#each data.providers as provider (provider.id)}
						{@const modelOptions = providerModelOptions(provider)}
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
									<input class="field" name="name" value={provider.name} />
								</label>
								<label class="space-y-1">
									<span class="font-label-md text-label-md uppercase text-text-muted">Provider ID</span>
									<input class="field" name="providerId" value={provider.providerId} />
								</label>
								<label class="space-y-1">
									<span class="font-label-md text-label-md uppercase text-text-muted">Kind</span>
									<select class="field" name="kind" value={provider.kind}>
										{#each providerKinds as kind (kind.value)}
											<option value={kind.value}>{kind.label}</option>
										{/each}
									</select>
								</label>
								<label class="space-y-1">
									<span class="font-label-md text-label-md uppercase text-text-muted">API</span>
									<input class="field" name="api" value={provider.api} />
								</label>
								<label class="space-y-1 sm:col-span-2">
									<span class="font-label-md text-label-md uppercase text-text-muted">Base URL</span>
									<input class="field" name="baseUrl" value={provider.baseUrl ?? ''} />
								</label>
								<label class="space-y-1">
									<span class="font-label-md text-label-md uppercase text-text-muted">Default Model</span>
									<select class="field" name="defaultModel" value={defaultModelValue(provider, modelOptions)}>
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
									<select class="field" name="defaultThinkingLevel" value={provider.defaultThinkingLevel}>
										{#each thinkingLevels as level (level)}
											<option value={level}>{level}</option>
										{/each}
									</select>
								</label>
								<div class="space-y-2 sm:col-span-2">
									<span class="font-label-md text-label-md uppercase text-text-muted">Models</span>
									{#if modelOptions.length > 0}
										<div class="model-list">
											{#each modelOptions as model (model.id)}
												<label class="model-favorite">
													<input
														class="model-favorite-input"
														type="checkbox"
														name="favoriteModels"
														value={model.id}
														checked={provider.favoriteModels.includes(model.id)}
													/>
													<span class="favorite-toggle" aria-hidden="true">
														<span class="material-symbols-outlined favorite-icon">star</span>
													</span>
													<span class="model-name">{model.name}</span>
													{#if model.id === provider.defaultModel}
														<span class="model-badge">Default</span>
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
										<textarea class="field min-h-20" name="models" value={provider.models.join('\n')}></textarea>
									{/if}
								</div>
								<label class="space-y-1 sm:col-span-2">
									<span class="font-label-md text-label-md uppercase text-text-muted">New API Key</span>
									<input class="field" name="apiKey" type="password" autocomplete="off" placeholder={provider.hasApiKey ? 'Saved' : ''} />
								</label>
								<div class="flex flex-wrap gap-4 sm:col-span-2">
									<label class="toggle">
										<input type="checkbox" name="enabled" checked={provider.enabled} />
										<span>Enabled</span>
									</label>
									<label class="toggle">
										<input type="checkbox" name="isDefault" checked={provider.isDefault} />
										<span>Default</span>
									</label>
									<label class="toggle">
										<input type="checkbox" name="authHeader" checked={provider.authHeader} />
										<span>Auth header</span>
									</label>
								</div>
								<div class="sm:col-span-2 flex justify-end">
									<button class="primary-button">Save</button>
								</div>
							</form>
						</div>
					{:else}
						<div class="rounded-lg border border-border-subtle bg-surface-container-low p-6 text-text-muted">
							No providers saved.
						</div>
					{/each}
				</div>

				<form class="h-fit rounded-lg border border-border-subtle bg-surface-container-low p-4" method="POST" action="?/saveProvider">
					<h2 class="mb-4 font-body-md text-body-md font-semibold text-primary">Add Provider</h2>
					{#if data.supportedProviders.length > 0}
						<div class="grid gap-3">
							<label class="space-y-1">
								<span class="font-label-md text-label-md uppercase text-text-muted">Provider</span>
								<select
									class="field"
									name="providerId"
									value={selectedProviderId}
									onchange={selectSupportedProvider}
								>
									{#each data.supportedProviders as provider (provider.id)}
										<option value={provider.id}>{provider.name}</option>
									{/each}
								</select>
							</label>
							<label class="space-y-1">
								<span class="font-label-md text-label-md uppercase text-text-muted">Default Model</span>
								<select class="field" name="defaultModel" value={selectedDefaultModel} onchange={selectDefaultModel}>
									{#each selectedSupportedModels as model (model.id)}
										<option value={model.id}>{model.name}</option>
									{/each}
								</select>
							</label>
							<label class="space-y-1">
								<span class="font-label-md text-label-md uppercase text-text-muted">Thinking</span>
								<select class="field" name="defaultThinkingLevel">
									{#each thinkingLevels as level (level)}
										<option value={level} selected={level === 'medium'}>{level}</option>
									{/each}
								</select>
							</label>
							<label class="space-y-1">
								<span class="font-label-md text-label-md uppercase text-text-muted">API Key</span>
								<input class="field" name="apiKey" type="password" autocomplete="off" placeholder="Optional" />
							</label>
							<div class="flex flex-wrap gap-4">
								<label class="toggle">
									<input type="checkbox" name="enabled" checked />
									<span>Enabled</span>
								</label>
								<label class="toggle">
									<input type="checkbox" name="isDefault" />
									<span>Default</span>
								</label>
							</div>
							<button class="primary-button">Add Provider</button>
						</div>
					{:else}
						<div class="rounded-lg border border-border-subtle bg-surface-container p-4 text-text-muted">
							No supported providers found.
						</div>
					{/if}
				</form>
			</section>
		{:else}
			<section class="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
				<form
					class="mcp-json-panel"
					method="POST"
					action="?/saveMcpJson"
					aria-labelledby="mcp-json-heading"
				>
					<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 id="mcp-json-heading" class="font-body-md text-body-md font-semibold text-primary">
								MCP JSON
							</h2>
							<p class="font-body-sm text-body-sm text-text-muted">mcpServers</p>
						</div>
						<button class="primary-button">Save JSON</button>
					</div>
					<label class="sr-only" for="mcp-json">MCP JSON</label>
					<textarea
						id="mcp-json"
						class="json-editor"
						name="mcpJson"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						value={form?.mcpJson ?? data.mcpJson}
					></textarea>
				</form>

				<aside class="space-y-3" aria-label="Saved MCP servers">
					<div class="mcp-example-panel">
						<div class="mb-3">
							<h2 class="font-body-md text-body-md font-semibold text-primary">JSON Example</h2>
							<p class="mt-1 font-body-sm text-body-sm text-text-muted">
								Use server keys as slugs. Local servers use command and args; remote servers use url.
								Add transport: "sse" only for legacy SSE endpoints.
							</p>
						</div>
						<pre class="example-code"><code>{mcpJsonExample}</code></pre>
					</div>
					<div class="flex items-center justify-between gap-3">
						<h2 class="font-body-md text-body-md font-semibold text-primary">Saved Servers</h2>
						<span class="font-code text-code text-text-muted">{data.mcpServers.length}</span>
					</div>
					{#each data.mcpServers as server (server.id)}
						<div class="server-row">
							<div class="min-w-0 flex-1">
								<div class="flex min-w-0 items-center gap-2">
									<span class={['status-dot', server.status]} aria-hidden="true"></span>
									<h3 class="truncate font-body-sm text-body-sm font-semibold text-primary">
										{server.name}
									</h3>
								</div>
								<p class="mt-1 truncate font-code text-code text-text-muted">
									{server.slug} · {server.transport}
								</p>
								<div class="mt-2 flex flex-wrap gap-1.5">
									<span class="status-pill">{server.enabled ? 'enabled' : 'disabled'}</span>
									<span class="status-pill">{server.status}</span>
									{#if server.hasEnvSecrets}
										<span class="status-pill">env</span>
									{/if}
									{#if server.hasHeaderSecrets}
										<span class="status-pill">headers</span>
									{/if}
								</div>
								{#if server.lastError}
									<p class="mt-2 line-clamp-2 font-body-sm text-body-sm text-error">
										{server.lastError}
									</p>
								{/if}
							</div>
							<div class="server-actions">
								<form method="POST" action="?/testMcp">
									<input type="hidden" name="id" value={server.id} />
									<button class="icon-button" aria-label="Test MCP server">
										<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">hub</span>
									</button>
								</form>
								<form method="POST" action="?/deleteMcp">
									<input type="hidden" name="id" value={server.id} />
									<button class="icon-button danger" aria-label="Delete MCP server">
										<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">delete</span>
									</button>
								</form>
							</div>
						</div>
					{:else}
						<div class="rounded-lg border border-border-subtle bg-surface-container-low p-6 text-text-muted">
							No MCP servers saved.
						</div>
					{/each}
				</aside>
			</section>
		{/if}
	</div>
</div>

<style>
	.field {
		width: 100%;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface-container);
		padding: 0.625rem 0.75rem;
		color: var(--color-text-primary);
		outline: none;
	}

	.field:focus {
		border-color: var(--color-outline);
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--color-text-muted);
		font-size: 14px;
		line-height: 20px;
	}

	.model-list {
		display: grid;
		max-height: 16rem;
		gap: 0.375rem;
		overflow-y: auto;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface-container);
		padding: 0.375rem;
	}

	.model-favorite {
		position: relative;
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.625rem;
		border-radius: 0.375rem;
		padding: 0.375rem 0.5rem;
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			background 150ms ease,
			color 150ms ease;
	}

	.model-favorite:hover {
		background: var(--color-surface-container-high);
		color: var(--color-primary);
	}

	.model-favorite-input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}

	.favorite-toggle {
		display: inline-flex;
		height: 1.75rem;
		width: 1.75rem;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		border-radius: 0.375rem;
		border: 1px solid var(--color-border-subtle);
		color: var(--color-text-muted);
		transition:
			border-color 150ms ease,
			color 150ms ease;
	}

	.favorite-icon {
		font-size: 20px;
		font-variation-settings: 'FILL' 0;
	}

	.model-favorite-input:checked + .favorite-toggle {
		border-color: var(--color-outline);
		color: var(--color-primary);
	}

	.model-favorite-input:checked + .favorite-toggle .favorite-icon {
		font-variation-settings: 'FILL' 1;
	}

	.model-favorite-input:focus-visible + .favorite-toggle {
		outline: 1px solid var(--color-outline);
		outline-offset: 2px;
	}

	.model-name {
		min-width: 0;
		flex: 1 1 auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-code);
		font-size: 14px;
		line-height: 20px;
		color: var(--color-text-primary);
	}

	.model-badge {
		flex: 0 0 auto;
		border-radius: 0.25rem;
		border: 1px solid var(--color-outline-variant);
		padding: 0.125rem 0.375rem;
		font-size: 11px;
		line-height: 1;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.mcp-json-panel {
		display: flex;
		min-height: 34rem;
		flex-direction: column;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface-container-low);
		padding: 1rem;
	}

	.json-editor {
		min-height: 28rem;
		flex: 1 1 auto;
		resize: vertical;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface-container);
		padding: 0.875rem;
		color: var(--color-text-primary);
		font-family: var(--font-code);
		font-size: 14px;
		line-height: 20px;
		outline: none;
		tab-size: 2;
	}

	.json-editor:focus {
		border-color: var(--color-outline);
	}

	.mcp-example-panel {
		border-radius: 0.5rem;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface-container-low);
		padding: 0.875rem;
	}

	.example-code {
		max-height: 24rem;
		overflow: auto;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface-container);
		padding: 0.75rem;
		color: var(--color-text-primary);
		font-family: var(--font-code);
		font-size: 12px;
		line-height: 18px;
		white-space: pre;
	}

	.server-row {
		display: flex;
		gap: 0.75rem;
		align-items: flex-start;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface-container-low);
		padding: 0.875rem;
	}

	.status-dot {
		width: 0.5rem;
		height: 0.5rem;
		flex: 0 0 auto;
		border-radius: 9999px;
		background: var(--color-outline-variant);
	}

	.status-dot.ok {
		background: var(--color-primary);
	}

	.status-dot.error {
		background: var(--color-error);
	}

	.status-pill {
		border-radius: 0.25rem;
		border: 1px solid var(--color-outline-variant);
		padding: 0.125rem 0.375rem;
		font-size: 11px;
		line-height: 1;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.server-actions {
		display: flex;
		flex: 0 0 auto;
		gap: 0.375rem;
	}

	.icon-button {
		display: inline-flex;
		width: 2.25rem;
		height: 2.25rem;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border-subtle);
		color: var(--color-text-muted);
		transition:
			background 150ms ease,
			color 150ms ease;
	}

	.icon-button:hover {
		background: var(--color-surface-container-high);
		color: var(--color-primary);
	}

	.icon-button.danger:hover {
		color: var(--color-error);
	}

	.primary-button {
		border-radius: 0.5rem;
		background: var(--color-primary);
		padding: 0.625rem 0.875rem;
		color: var(--color-background);
		font-weight: 600;
	}
</style>
