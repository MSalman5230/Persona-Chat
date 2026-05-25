<script lang="ts">
	import { applyAction, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ConfirmActionButton from '$lib/components/common/ConfirmActionButton.svelte';
	import '$lib/components/settings/settings.css';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Agent = (typeof data.agents)[number];

	let selectedAgentId = $state(untrack(() => data.agents[0]?.id ?? ''));

	const selectedAgent = $derived.by(() => {
		if (!selectedAgentId) return undefined;
		return data.agents.find((agent) => agent.id === selectedAgentId) ?? data.agents[0];
	});
	const activeAgentId = $derived(selectedAgent?.id ?? '');
	const editingExisting = $derived(Boolean(selectedAgent));

	function newAgent() {
		selectedAgentId = '';
	}

	async function confirmDeleteAgent(agent: Agent) {
		const body = new FormData();
		body.set('id', agent.id);
		const response = await fetch('?/deleteAgent', {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = deserialize(await response.text());
		await applyAction(result);

		if (result.type === 'success') {
			selectedAgentId = '';
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
				<a
					href={resolve('/')}
					class="flex h-9 w-9 items-center justify-center rounded-lg border border-border-subtle bg-surface-container-low text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
					aria-label="Back to chat"
				>
					<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">arrow_back</span>
				</a>
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
								{#if agent.isDefault}
									<span class="settings-status-pill">default</span>
								{/if}
								<span class="settings-status-pill">{agent.toolNames.length} tools</span>
								<span class="settings-status-pill">{agent.mcpServerIds.length} mcp</span>
							</div>
						</div>
					</button>
				{:else}
					<div class="rounded-lg border border-border-subtle bg-surface-container-low p-6 text-text-muted">
						No agents saved.
					</div>
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
						<input class="settings-field" name="name" value={selectedAgent?.name ?? ''} />
					</label>
					<label class="mt-auto flex h-10 items-center gap-2 font-body-sm text-body-sm text-text-primary">
						{#if selectedAgent?.isDefault}
							<input type="hidden" name="isDefault" value="true" />
						{/if}
						<input
							type="checkbox"
							name="isDefault"
							class="h-4 w-4 accent-primary"
							checked={selectedAgent?.isDefault ?? data.agents.length === 0}
							disabled={selectedAgent?.isDefault ?? false}
						/>
						<span>Default</span>
					</label>
				</div>

				<label class="mt-4 block flex-1 space-y-2">
					<span class="font-label-md text-label-md uppercase text-text-muted">System Prompt</span>
					<textarea
						name="systemPrompt"
						class="custom-scrollbar min-h-56 w-full resize-y rounded-lg border border-border-subtle bg-surface-container px-3 py-2.5 font-body-sm text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-outline"
						placeholder="Empty"
						value={selectedAgent?.systemPrompt ?? ''}
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
										checked={selectedAgent ? selectedAgent.toolNames.includes(tool.name) : true}
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
										checked={selectedAgent?.mcpServerIds.includes(server.id) ?? false}
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
							<ConfirmActionButton
								title="Delete agent?"
								description={`Delete "${selectedAgent.name}"? Saved chats will keep their messages.`}
								confirmLabel="Delete agent"
								buttonLabel="Delete agent"
								buttonClass="settings-icon-button danger"
								onConfirm={() => confirmDeleteAgent(selectedAgent)}
							/>
						{/if}
					</div>
					<button class="settings-primary-button inline-flex items-center gap-2">
						<span class="material-symbols-outlined !text-[18px]" aria-hidden="true">save</span>
						<span>{editingExisting ? 'Save Agent' : 'Create Agent'}</span>
					</button>
				</div>
			</form>
		</section>
	</div>
</div>
