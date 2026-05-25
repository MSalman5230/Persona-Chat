<script lang="ts">
	import ConfirmFormDelete from '$lib/components/common/ConfirmFormDelete.svelte';
	import { MCP_JSON_EXAMPLE, type McpServerOption } from '$lib/client/settings';

	interface Props {
		mcpServers: McpServerOption[];
		canManage: boolean;
		mcpJson: string;
		formMcpJson?: string;
	}

	let { mcpServers, canManage, mcpJson, formMcpJson }: Props = $props();
</script>

<section class={['grid flex-1 gap-6', canManage ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : '']}>
	{#if canManage}
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
	{/if}

	<aside class="space-y-3" aria-label="Saved MCP servers">
		{#if canManage}
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
		{/if}
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
				{#if canManage}
					<div class="settings-server-actions">
						<form method="POST" action="?/testMcp">
							<input type="hidden" name="id" value={server.id} />
							<button class="settings-icon-button" aria-label="Test MCP server">
								<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">hub</span>
							</button>
						</form>
						<ConfirmFormDelete
							action="?/deleteMcp"
							id={server.id}
							title="Delete MCP server?"
							description={`Delete "${server.name}"? This removes its saved configuration.`}
							confirmLabel="Delete server"
							buttonLabel="Delete MCP server"
							buttonClass="settings-icon-button danger"
						/>
					</div>
				{/if}
			</div>
		{:else}
			<div class="rounded-lg border border-border-subtle bg-surface-container-low p-6 text-text-muted">
			No MCP servers saved.
		</div>
	{/each}
</aside>
</section>
