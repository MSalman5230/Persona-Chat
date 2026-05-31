<script lang="ts">
	import { applyAction, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
	import { getAppSidebarContext } from '$lib/components/chat/sidebar-context';
	import '$lib/components/settings/settings.css';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const sidebar = getAppSidebarContext();

	type Agent = (typeof data.agents)[number];

	let selectedAgentId = $state(untrack(() => data.agents[0]?.id ?? ''));
	let pendingDeleteAgent = $state<Agent | null>(null);

	const selectedAgent = $derived.by(() => {
		if (!selectedAgentId) return undefined;
		return data.agents.find((agent) => agent.id === selectedAgentId) ?? data.agents[0];
	});
	const activeAgentId = $derived(selectedAgent?.id ?? '');
	const editingExisting = $derived(Boolean(selectedAgent));
	const selectedIsPrebuilt = $derived(selectedAgent?.isPrebuilt ?? false);
	const allToolNames = $derived(data.agentTools.map((tool) => tool.name));
	const allMcpServerIds = $derived(data.mcpServers.map((server) => server.id));
	const selectedToolNames = $derived(
		selectedAgent?.toolAccess === 'all' ? allToolNames : (selectedAgent?.toolNames ?? allToolNames)
	);
	const selectedMcpServerIds = $derived(
		selectedAgent?.mcpServerAccess === 'all' ? allMcpServerIds : (selectedAgent?.mcpServerIds ?? [])
	);
	const selectedToolsLocked = $derived(
		selectedAgent?.toolAccess === 'all' || (selectedAgent?.toolsLocked ?? false)
	);
	const selectedMcpServersLocked = $derived(
		selectedAgent?.mcpServerAccess === 'all' || (selectedAgent?.mcpServersLocked ?? false)
	);

	function agentToolCount(agent: Agent): number {
		return agent.toolAccess === 'all' ? data.agentTools.length : agent.toolNames.length;
	}

	function agentMcpServerCount(agent: Agent): number {
		return agent.mcpServerAccess === 'all' ? data.mcpServers.length : agent.mcpServerIds.length;
	}

	function newAgent() {
		selectedAgentId = '';
	}

	function requestDeleteAgent(agent: Agent) {
		pendingDeleteAgent = agent;
	}

	function cancelDeleteAgent() {
		pendingDeleteAgent = null;
	}

	function formResultAgentId(data: unknown): string {
		return data && typeof data === 'object' && typeof (data as { agentId?: unknown }).agentId === 'string'
			? (data as { agentId: string }).agentId
			: '';
	}

	async function clonePrebuiltAgent() {
		const response = await fetch('?/clonePrebuiltAgent', {
			method: 'POST',
			body: new FormData(),
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		await applyAction(result);

		if (result.type === 'success') {
			const agentId = formResultAgentId(result.data);
			await invalidateAll();
			if (agentId) selectedAgentId = agentId;
		}
	}

	async function confirmDeleteAgent() {
		if (!pendingDeleteAgent) return;

		const body = new FormData();
		body.set('id', pendingDeleteAgent.id);
		const response = await fetch('?/deleteAgent', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		await applyAction(result);

		if (result.type === 'success') {
			selectedAgentId = '';
			pendingDeleteAgent = null;
			await invalidateAll();
		}
	}
</script>

<svelte:head>
	<title>Agents - Persona</title>
</svelte:head>

<div class="custom-scrollbar h-dvh overflow-y-auto bg-background text-text-primary">
	<div class="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
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
					<h1 class="font-headline-md text-headline-md text-primary">Agents</h1>
					<p class="font-body-sm text-body-sm text-text-muted">Prompts, tools, and MCP access</p>
				</div>
			</div>
			<button
				type="button"
				class="settings-primary-button inline-flex items-center gap-2"
				onclick={newAgent}
			>
				<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">add</span>
				<span>New Agent</span>
			</button>
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

		<section class="grid flex-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
			<aside class="space-y-3" aria-label="Saved agents">
				{#each data.agents as agent (agent.id)}
					<button
						type="button"
						class={[
							'settings-server-row w-full cursor-pointer text-left transition-colors',
							activeAgentId === agent.id ? 'border-outline bg-surface-container' : ''
						]}
						onclick={() => (selectedAgentId = agent.id)}
					>
						<div class="min-w-0 flex-1">
							<div class="flex min-w-0 items-center gap-2">
								<span class="material-symbols-outlined !text-[18px] text-text-muted" aria-hidden="true">
									smart_toy
								</span>
								<h2 class="truncate font-body-sm text-body-sm font-semibold text-primary">
									{agent.name}
								</h2>
							</div>
							<div class="mt-2 flex flex-wrap gap-1.5">
								{#if agent.isPrebuilt}
									<span class="settings-status-pill">prebuilt</span>
								{/if}
								{#if agent.isDefault}
									<span class="settings-status-pill">default</span>
								{/if}
								<span class="settings-status-pill">{agentToolCount(agent)} tools</span>
								<span class="settings-status-pill">{agentMcpServerCount(agent)} mcp</span>
							</div>
						</div>
					</button>
				{/each}
			</aside>

			<form
				class="flex min-h-[34rem] flex-col rounded-lg border border-border-subtle bg-surface-container-low p-4"
				method="POST"
				action="?/saveAgent"
				aria-label="Agent editor"
			>
				{#if selectedAgent}
					<input type="hidden" name="id" value={selectedAgent.id} />
				{/if}

				<div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
					<label class="block space-y-2">
						<span class="font-label-md text-label-md uppercase text-text-muted">Name</span>
						<input
							class="settings-field"
							name="name"
							value={selectedAgent?.name ?? ''}
							readonly={selectedIsPrebuilt}
						/>
					</label>
					<label class="mt-auto flex h-10 items-center gap-2 font-body-sm text-body-sm text-text-primary">
						{#if selectedAgent?.isDefault && !selectedIsPrebuilt}
							<input type="hidden" name="isDefault" value="true" />
						{/if}
						<input
							type="checkbox"
							name="isDefault"
							class="h-4 w-4 accent-primary"
							checked={selectedAgent?.isDefault ?? false}
							disabled={selectedIsPrebuilt || (selectedAgent?.isDefault ?? false)}
						/>
						<span>Default</span>
					</label>
				</div>

				<label class="mt-4 flex min-h-0 flex-1 flex-col gap-2">
					<span class="font-label-md text-label-md uppercase text-text-muted">System Prompt</span>
					<textarea
						name="systemPrompt"
						class="system-prompt-textarea custom-scrollbar min-h-56 w-full flex-auto resize-none overflow-y-auto rounded-lg border border-border-subtle bg-surface-container px-3 py-2.5 font-body-sm text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-outline"
						placeholder="Empty"
						value={selectedAgent?.systemPrompt ?? ''}
						readonly={selectedIsPrebuilt}
					></textarea>
				</label>

				<div class="mt-5 grid gap-5 xl:grid-cols-2">
					<section class="space-y-2" aria-labelledby="agent-tools-heading">
						<h2 id="agent-tools-heading" class="font-label-md text-label-md uppercase text-text-muted">
							Tools
						</h2>
						<div class="settings-model-list">
							{#each data.agentTools as tool (tool.name)}
								<label class="settings-model-favorite">
									<input
										class="settings-model-favorite-input"
										type="checkbox"
										name="toolNames"
										value={tool.name}
										checked={selectedToolNames.includes(tool.name)}
										disabled={selectedToolsLocked}
									/>
									<span class="settings-favorite-toggle">
										<span class="material-symbols-outlined settings-favorite-icon" aria-hidden="true">
											check
										</span>
									</span>
									<span class="min-w-0 flex-1">
										<span class="block truncate font-body-sm text-body-sm text-primary">
											{tool.label}
										</span>
										<span class="block truncate font-code text-code text-text-muted">
											{tool.name}
										</span>
									</span>
								</label>
							{/each}
						</div>
					</section>

					<section class="space-y-2" aria-labelledby="agent-mcp-heading">
						<h2 id="agent-mcp-heading" class="font-label-md text-label-md uppercase text-text-muted">
							MCP Servers
						</h2>
						<div class="settings-model-list">
							{#each data.mcpServers as server (server.id)}
								<label class="settings-model-favorite">
									<input
										class="settings-model-favorite-input"
										type="checkbox"
										name="mcpServerIds"
										value={server.id}
										checked={selectedMcpServerIds.includes(server.id)}
										disabled={selectedMcpServersLocked}
									/>
									<span class="settings-favorite-toggle">
										<span class="material-symbols-outlined settings-favorite-icon" aria-hidden="true">
											check
										</span>
									</span>
									<span class="min-w-0 flex-1">
										<span class="block truncate font-body-sm text-body-sm text-primary">
											{server.name}
										</span>
										<span class="block truncate font-code text-code text-text-muted">
											{server.slug} · {server.transport}
										</span>
									</span>
									<span class="settings-model-badge">{server.enabled ? 'on' : 'off'}</span>
								</label>
							{:else}
								<p class="px-3 py-2 font-body-sm text-body-sm text-text-muted">No MCP servers saved.</p>
							{/each}
						</div>
					</section>
				</div>

				<div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
					<div class="flex gap-2">
						{#if selectedAgent}
							<button
								class="settings-icon-button"
								aria-label="Set default agent"
								disabled={selectedAgent.isDefault}
								formmethod="POST"
								formaction="?/defaultAgent"
							>
								<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">star</span>
							</button>
							{#if !selectedIsPrebuilt}
								<button
									type="button"
									class="settings-icon-button danger"
									aria-label="Delete agent"
									onclick={() => requestDeleteAgent(selectedAgent)}
								>
									<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">delete</span>
								</button>
							{/if}
						{/if}
					</div>
					{#if selectedIsPrebuilt}
						<button
							type="button"
							class="settings-primary-button inline-flex items-center gap-2"
							onclick={clonePrebuiltAgent}
						>
							<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">content_copy</span>
							<span>Copy Agent</span>
						</button>
					{:else}
						<button class="settings-primary-button inline-flex items-center gap-2">
							<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">save</span>
							<span>{editingExisting ? 'Save Agent' : 'Create Agent'}</span>
						</button>
					{/if}
				</div>
			</form>
		</section>
	</div>
</div>

<ConfirmDialog
	open={pendingDeleteAgent !== null}
	title="Delete agent?"
	description={pendingDeleteAgent ? `Delete "${pendingDeleteAgent.name}"? Saved chats will keep their messages.` : ''}
	confirmLabel="Delete agent"
	variant="danger"
	onCancel={cancelDeleteAgent}
	onConfirm={confirmDeleteAgent}
/>

<style>
	.system-prompt-textarea {
		height: clamp(14rem, 42dvh, 34rem);
		max-height: min(34rem, calc(100dvh - 22rem));
	}
</style>
