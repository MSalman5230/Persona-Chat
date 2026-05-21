<script lang="ts">
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
	import { MCP_JSON_EXAMPLE, type McpServerOption } from '$lib/client/settings';

	interface Props {
		mcpServers: McpServerOption[];
		mcpJson: string;
		formMcpJson?: string;
	}

	let { mcpServers, mcpJson, formMcpJson }: Props = $props();

	let pendingDeleteServer = $state<McpServerOption | null>(null);
	let deleteForm: HTMLFormElement | null = null;

	function requestDeleteMcp(event: SubmitEvent, server: McpServerOption) {
		event.preventDefault();
		deleteForm = event.currentTarget as HTMLFormElement;
		pendingDeleteServer = server;
	}

	function cancelDeleteMcp() {
		pendingDeleteServer = null;
		deleteForm = null;
	}

	function confirmDeleteMcp() {
		const form = deleteForm;
		pendingDeleteServer = null;
		deleteForm = null;
		form?.submit();
	}
</script>

<section class="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
	<form
		class="settings-mcp-json-panel"
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
			<button class="settings-primary-button">Save JSON</button>
		</div>
		<label class="sr-only" for="mcp-json">MCP JSON</label>
		<textarea
			id="mcp-json"
			class="settings-json-editor"
			name="mcpJson"
			autocomplete="off"
			autocapitalize="off"
			spellcheck="false"
			value={formMcpJson ?? mcpJson}
		></textarea>
	</form>

	<aside class="space-y-3" aria-label="Saved MCP servers">
		<div class="settings-mcp-example-panel">
			<div class="mb-3">
				<h2 class="font-body-md text-body-md font-semibold text-primary">JSON Example</h2>
				<p class="mt-1 font-body-sm text-body-sm text-text-muted">
					Use server keys as slugs. Local servers use command and args; remote servers use url.
					Add transport: "sse" only for legacy SSE endpoints.
				</p>
			</div>
			<pre class="settings-example-code"><code>{MCP_JSON_EXAMPLE}</code></pre>
		</div>
		<div class="flex items-center justify-between gap-3">
			<h2 class="font-body-md text-body-md font-semibold text-primary">Saved Servers</h2>
			<span class="font-code text-code text-text-muted">{mcpServers.length}</span>
		</div>
		{#each mcpServers as server (server.id)}
			<div class="settings-server-row">
				<div class="min-w-0 flex-1">
					<div class="flex min-w-0 items-center gap-2">
						<span class={['settings-status-dot', server.status]} aria-hidden="true"></span>
						<h3 class="truncate font-body-sm text-body-sm font-semibold text-primary">
							{server.name}
						</h3>
					</div>
					<p class="mt-1 truncate font-code text-code text-text-muted">
						{server.slug} · {server.transport}
					</p>
					<div class="mt-2 flex flex-wrap gap-1.5">
						<span class="settings-status-pill">{server.enabled ? 'enabled' : 'disabled'}</span>
						<span class="settings-status-pill">{server.status}</span>
						{#if server.hasEnvSecrets}
							<span class="settings-status-pill">env</span>
						{/if}
						{#if server.hasHeaderSecrets}
							<span class="settings-status-pill">headers</span>
						{/if}
					</div>
					{#if server.lastError}
						<p class="mt-2 line-clamp-2 font-body-sm text-body-sm text-error">
							{server.lastError}
						</p>
					{/if}
				</div>
				<div class="settings-server-actions">
					<form method="POST" action="?/testMcp">
						<input type="hidden" name="id" value={server.id} />
						<button class="settings-icon-button" aria-label="Test MCP server">
							<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">hub</span>
						</button>
					</form>
					<form method="POST" action="?/deleteMcp" onsubmit={(event) => requestDeleteMcp(event, server)}>
						<input type="hidden" name="id" value={server.id} />
						<button class="settings-icon-button danger" aria-label="Delete MCP server">
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

<ConfirmDialog
	open={pendingDeleteServer !== null}
	title="Delete MCP server?"
	description={pendingDeleteServer
		? `Delete "${pendingDeleteServer.name}"? This removes its saved configuration.`
		: ''}
	confirmLabel="Delete server"
	variant="danger"
	onCancel={cancelDeleteMcp}
	onConfirm={confirmDeleteMcp}
/>
</section>
