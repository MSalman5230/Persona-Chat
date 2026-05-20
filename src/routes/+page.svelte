<script lang="ts">
	import { resolve } from '$app/paths';
	import { renderAssistantMarkdown } from '$lib/markdown';
	import type { Attachment } from 'svelte/attachments';
	import { onMount, tick } from 'svelte';

	type UiThought = {
		contentIndex: number;
		text: string;
		status: 'thinking' | 'thought';
		durationMs?: number;
		redacted: boolean;
		expanded: boolean;
		startedAt?: number;
	};

	type UiTool = {
		contentIndex: number;
		id: string;
		name: string;
		status: 'pending' | 'running' | 'completed' | 'failed';
		startedAt?: number;
		durationMs?: number;
	};

	type UiMessage = {
		role: 'user' | 'assistant' | 'tool' | 'system';
		text: string;
		thoughts: UiThought[];
		tools: UiTool[];
		toolName?: string;
	};

	let { data } = $props();

	let message = $state('');
	let sidebarOpen = $state(false);
	let isStreaming = $state(false);
	let activeSessionId = $state<string | null>(null);
	let selectedProviderIdOverride = $state<string | null>(null);
	let selectedModelOverride = $state<string | null>(null);
	let errorText = $state('');
	let messages = $state<UiMessage[]>([]);
	let now = $state(Date.now());
	let focusChatInput: (() => void) | undefined;

	const providerOptions = $derived(data.providers);
	const selectedProviderId = $derived(selectedProviderIdOverride ?? data.defaultProviderId ?? '');
	const selectedModel = $derived(selectedModelOverride ?? data.defaultModel ?? '');
	const selectedProvider = $derived(
		providerOptions.find((provider) => provider.id === selectedProviderId) ?? providerOptions[0]
	);
	const canSend = $derived(message.trim().length > 0 && !isStreaming);
	const hasProviders = $derived(providerOptions.length > 0);
	const hasActiveThought = $derived(
		messages.some((item) => item.thoughts.some((thought) => thought.status === 'thinking'))
	);
	const hasActiveTool = $derived(
		messages.some((item) => item.tools.some((tool) => tool.status === 'running'))
	);

	onMount(() => {
		const interval = window.setInterval(() => {
			if (hasActiveThought || hasActiveTool) now = Date.now();
		}, 250);

		return () => window.clearInterval(interval);
	});

	function isRecord(value: unknown): value is Record<string, unknown> {
		return !!value && typeof value === 'object' && !Array.isArray(value);
	}

	function roleFromServer(role: unknown): UiMessage['role'] {
		if (role === 'assistant') return 'assistant';
		if (role === 'toolResult' || role === 'tool') return 'tool';
		if (role === 'system') return 'system';
		return 'user';
	}

	function durationFromServer(value: unknown): number | undefined {
		return typeof value === 'number' && Number.isFinite(value) && value >= 0
			? Math.round(value)
			: undefined;
	}

	function normalizeServerThoughts(thoughts: unknown, existingThoughts: UiThought[] = []): UiThought[] {
		if (!Array.isArray(thoughts)) return [];

		const previousByIndex = new Map(
			existingThoughts.map((thought) => [thought.contentIndex, thought])
		);

		return thoughts.flatMap((thought): UiThought[] => {
			if (!isRecord(thought) || typeof thought.contentIndex !== 'number') return [];

			const previous = previousByIndex.get(thought.contentIndex);
			const status = thought.status === 'thinking' ? 'thinking' : 'thought';
			const durationMs = durationFromServer(thought.durationMs);
			const wasThinking = previous?.status === 'thinking';
			const expanded =
				status === 'thinking' ? true : wasThinking ? false : (previous?.expanded ?? false);
			const startedAt =
				status === 'thinking'
					? (previous?.startedAt ?? Date.now() - (durationMs ?? 0))
					: undefined;
			const redacted = thought.redacted === true;

			return [
				{
					contentIndex: thought.contentIndex,
					text: redacted ? '' : typeof thought.text === 'string' ? thought.text : '',
					status,
					...(durationMs !== undefined ? { durationMs } : {}),
					redacted,
					expanded,
					...(startedAt !== undefined ? { startedAt } : {})
				}
			];
		});
	}

	function normalizeServerTools(tools: unknown, existingTools: UiTool[] = []): UiTool[] {
		if (!Array.isArray(tools)) return [];

		const previousByKey = new Map(
			existingTools.map((tool) => [tool.id || String(tool.contentIndex), tool])
		);

		return tools.flatMap((tool): UiTool[] => {
			if (!isRecord(tool) || typeof tool.contentIndex !== 'number') return [];
			if (typeof tool.id !== 'string' || typeof tool.name !== 'string') return [];

			const previous = previousByKey.get(tool.id) ?? previousByKey.get(String(tool.contentIndex));
			const incomingStatus =
				tool.status === 'running' ||
				tool.status === 'completed' ||
				tool.status === 'failed' ||
				tool.status === 'pending'
					? tool.status
					: 'pending';
			const status =
				previous?.status === 'running' && incomingStatus === 'pending'
					? previous.status
					: previous?.status === 'completed' || previous?.status === 'failed'
						? previous.status
						: incomingStatus;
			const durationMs = durationFromServer(tool.durationMs) ?? previous?.durationMs;
			const startedAt =
				status === 'running'
					? (previous?.startedAt ?? Date.now() - (durationMs ?? 0))
					: previous?.startedAt;

			return [
				{
					contentIndex: tool.contentIndex,
					id: tool.id,
					name: tool.name,
					status,
					...(startedAt !== undefined ? { startedAt } : {}),
					...(durationMs !== undefined ? { durationMs } : {})
				}
			];
		});
	}

	function uiMessageFromServer(payload: Record<string, unknown>, previous?: UiMessage): UiMessage {
		const display = isRecord(payload.display) ? payload.display : undefined;
		const text =
			typeof display?.text === 'string'
				? display.text
				: typeof payload.text === 'string'
					? payload.text
					: '';

		return {
			role: roleFromServer(payload.role),
			text,
			thoughts: normalizeServerThoughts(display?.thoughts, previous?.thoughts),
			tools: normalizeServerTools(display?.tools, previous?.tools),
			...(typeof payload.toolName === 'string' ? { toolName: payload.toolName } : {})
		};
	}

	function replaceLastAssistantMessage(payload: Record<string, unknown>) {
		const index = messages.length - 1;
		if (index < 0) return;
		messages[index] = uiMessageFromServer(payload, messages[index]);
	}

	function toggleThought(messageIndex: number, contentIndex: number) {
		const thought = messages[messageIndex]?.thoughts.find(
			(item) => item.contentIndex === contentIndex
		);
		if (thought) thought.expanded = !thought.expanded;
	}

	function thoughtDurationMs(thought: UiThought): number | undefined {
		if (thought.status === 'thinking' && thought.startedAt !== undefined) {
			return Math.max(0, now - thought.startedAt);
		}

		return thought.durationMs;
	}

	function formatDuration(durationMs: number | undefined): string {
		if (durationMs === undefined) return '';
		if (durationMs < 1000) return '<1s';

		const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
		if (totalSeconds < 60) return `${totalSeconds}s`;

		const minutes = Math.floor(totalSeconds / 60);
		const seconds = String(totalSeconds % 60).padStart(2, '0');
		return `${minutes}m ${seconds}s`;
	}

	function toolDurationMs(tool: UiTool): number | undefined {
		if (tool.status === 'running' && tool.startedAt !== undefined) {
			return Math.max(0, now - tool.startedAt);
		}

		return tool.durationMs;
	}

	function thoughtLabel(thought: UiThought): string {
		const duration = formatDuration(thoughtDurationMs(thought));
		if (thought.status === 'thinking') return duration ? `Thinking... ${duration}` : 'Thinking...';
		return duration ? `Thought for ${duration}` : 'Thought';
	}

	function formatToolName(name: string): string {
		return name.replace(/^mcp_/, '').replace(/_/g, ' ');
	}

	function toolStatusLabel(tool: UiTool): string {
		const duration = formatDuration(toolDurationMs(tool));
		if (tool.status === 'running') return duration ? `Using ${formatToolName(tool.name)} ${duration}` : `Using ${formatToolName(tool.name)}`;
		if (tool.status === 'failed') return `Tool failed: ${formatToolName(tool.name)}`;
		if (tool.status === 'completed') return `Used ${formatToolName(tool.name)}`;
		return `Queued ${formatToolName(tool.name)}`;
	}

	function shouldShowAssistantPlaceholder(item: UiMessage): boolean {
		return (
			item.role === 'assistant' &&
			item.text.length === 0 &&
			item.thoughts.length === 0 &&
			item.tools.length === 0 &&
			isStreaming
		);
	}

	function mergeToolIntoLastAssistant(payload: Record<string, unknown>) {
		const lastAssistantIndex = messages.findLastIndex((item) => item.role === 'assistant');
		if (lastAssistantIndex < 0 || typeof payload.toolName !== 'string') return;

		const current = messages[lastAssistantIndex];
		const toolCallId = typeof payload.toolCallId === 'string' ? payload.toolCallId : payload.toolName;
		const existingIndex = current.tools.findIndex((tool) => tool.id === toolCallId);
		const previous = existingIndex >= 0 ? current.tools[existingIndex] : undefined;
		const status =
			payload.type === 'tool_execution_end'
				? payload.isError === true
					? 'failed'
					: 'completed'
				: 'running';
		const startedAt = previous?.startedAt ?? Date.now();
		const durationMs =
			status === 'running'
				? previous?.durationMs
				: Math.max(0, Date.now() - (previous?.startedAt ?? startedAt));
		const nextTool: UiTool = {
			contentIndex: previous?.contentIndex ?? current.tools.length,
			id: toolCallId,
			name: payload.toolName,
			status,
			startedAt,
			...(durationMs !== undefined ? { durationMs } : {})
		};
		const tools =
			existingIndex >= 0
				? current.tools.map((tool, index) => (index === existingIndex ? nextTool : tool))
				: [...current.tools, nextTool];

		messages[lastAssistantIndex] = { ...current, tools };
	}

	function resizeTextarea(node: HTMLTextAreaElement) {
		node.style.height = 'auto';
		node.style.height = `${Math.min(node.scrollHeight, 192)}px`;
	}

	const autosize: Attachment<HTMLTextAreaElement> = (node) => {
		resizeTextarea(node);
		const focus = () => {
			resizeTextarea(node);
			node.focus();
		};
		focusChatInput = focus;

		return () => {
			if (focusChatInput === focus) focusChatInput = undefined;
		};
	};

	function assistantMarkdown(text: string): Attachment<HTMLElement> {
		return (node) => {
			node.innerHTML = renderAssistantMarkdown(text);
		};
	}

	function handleMessageInput(event: Event) {
		resizeTextarea(event.currentTarget as HTMLTextAreaElement);
	}

	function newChat() {
		activeSessionId = null;
		messages = [];
		errorText = '';
		sidebarOpen = false;
		tick().then(() => focusChatInput?.());
	}

	async function loadSession(id: string) {
		const response = await fetch(`/api/chat-sessions/${id}`);
		if (!response.ok) return;
		const payload = (await response.json()) as {
			session: { id: string; providerConnectionId: string | null; modelId: string | null };
			messages: Array<Record<string, unknown>>;
		};
		activeSessionId = payload.session.id;
		selectedProviderIdOverride = payload.session.providerConnectionId ?? selectedProviderId;
		selectedModelOverride = payload.session.modelId ?? selectedModel;
		messages = payload.messages.map((item) => uiMessageFromServer(item));
		sidebarOpen = false;
	}

	function selectProvider(event: Event) {
		const id = (event.currentTarget as HTMLSelectElement).value;
		selectedProviderIdOverride = id;
		selectedModelOverride =
			providerOptions.find((provider) => provider.id === id)?.defaultModel ?? selectedModel;
	}

	function consumeSseChunk(buffer: string, onEvent: (event: string, data: string) => void) {
		const blocks = buffer.split('\n\n');
		const rest = blocks.pop() ?? '';
		for (const block of blocks) {
			const eventLine = block.split('\n').find((line) => line.startsWith('event: '));
			const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
			if (!eventLine || !dataLine) continue;
			onEvent(eventLine.slice(7), dataLine.slice(6));
		}
		return rest;
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const prompt = message.trim();
		if (!prompt || !hasProviders) return;

		message = '';
		errorText = '';
		isStreaming = true;
		messages = [
			...messages,
			{ role: 'user', text: prompt, thoughts: [], tools: [] },
			{ role: 'assistant', text: '', thoughts: [], tools: [] }
		];

		await tick();
		focusChatInput?.();

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId: activeSessionId,
					message: prompt,
					providerConnectionId: selectedProviderId || null,
					modelId: selectedModel || null
				})
			});

			if (!response.ok || !response.body) throw new Error('Chat request failed');

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				buffer = consumeSseChunk(buffer, (eventName, dataText) => {
					const payload = JSON.parse(dataText) as Record<string, unknown>;
					if (eventName === 'session' && typeof payload.id === 'string') {
						activeSessionId = payload.id;
					}
					if (eventName === 'error') {
						errorText = String(payload.message ?? 'Chat request failed');
					}
					if (eventName === 'event' && payload.type === 'message_update') {
						const eventMessage = isRecord(payload.message) ? payload.message : undefined;
						if (eventMessage?.role === 'assistant') {
							replaceLastAssistantMessage(eventMessage);
						}
					}
					if (
						eventName === 'event' &&
						(payload.type === 'tool_execution_start' ||
							payload.type === 'tool_execution_update' ||
							payload.type === 'tool_execution_end')
					) {
						mergeToolIntoLastAssistant(payload);
					}
					if (eventName === 'event' && payload.type === 'message_end') {
						const eventMessage = isRecord(payload.message) ? payload.message : undefined;
						if (eventMessage?.role === 'assistant') {
							replaceLastAssistantMessage(eventMessage);
						}
					}
				});
			}
		} catch (error) {
			errorText = error instanceof Error ? error.message : 'Chat request failed';
		} finally {
			isStreaming = false;
		}
	}
</script>

<svelte:head>
	<title>Persona Chat</title>
</svelte:head>

<div class="min-h-dvh overflow-hidden bg-background text-text-primary selection:bg-primary-container selection:text-on-primary-container">
	<header class="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-border-subtle bg-background/80 px-4 backdrop-blur-md md:hidden">
		<button
			type="button"
			class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
			aria-label="Open sidebar"
			onclick={() => (sidebarOpen = true)}
		>
			<span class="material-symbols-outlined" aria-hidden="true">menu</span>
		</button>
		<h1 class="font-headline-md text-headline-md text-primary">Persona</h1>
		<button
			type="button"
			class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
			aria-label="New chat"
			onclick={newChat}
		>
			<span class="material-symbols-outlined" aria-hidden="true">add</span>
		</button>
	</header>

	<div class="flex h-[calc(100dvh-4rem)] w-full overflow-hidden md:h-dvh">
		<aside
			class={[
				'fixed left-0 top-0 z-50 flex h-dvh w-sidebar-width flex-col border-r border-border-subtle bg-surface-container-low py-4 transition-transform duration-300 ease-in-out md:translate-x-0',
				sidebarOpen ? 'translate-x-0' : '-translate-x-full'
			]}
			aria-label="Sidebar"
		>
			<div class="mb-8 px-gutter">
				<div class="mb-1 flex items-center gap-3">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-background">
						<span class="material-symbols-outlined filled !text-[20px]" aria-hidden="true">neurology</span>
					</div>
					<h2 class="font-headline-md text-headline-md font-bold text-primary">Persona</h2>
				</div>
				<p class="font-body-sm text-body-sm text-text-muted">Local agent runtime</p>
			</div>

			<nav class="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
				<button
					type="button"
					class="flex w-full items-center gap-3 rounded-lg border-l-2 border-primary bg-surface-container px-4 py-2.5 text-left text-primary transition-colors duration-200"
					onclick={newChat}
				>
					<span class="material-symbols-outlined" aria-hidden="true">add</span>
					<span class="font-body-sm text-body-sm font-medium">New Chat</span>
				</button>

				<div class="px-4 pb-2 pt-6">
					<p class="text-[10px] font-bold uppercase tracking-widest text-text-muted/50">Recent Chats</p>
				</div>

				<div class="space-y-1">
					{#each data.sessions as chat (chat.id)}
						<button
							type="button"
							class={[
								'flex w-full items-center gap-3 truncate rounded-lg px-4 py-2 text-left transition-colors duration-200',
								activeSessionId === chat.id
									? 'bg-surface-container text-primary'
									: 'text-text-muted hover:bg-surface-container-high hover:text-primary'
							]}
							onclick={() => loadSession(chat.id)}
						>
							<span class="truncate font-body-sm text-body-sm">{chat.title}</span>
						</button>
					{:else}
						<p class="px-4 py-2 font-body-sm text-body-sm text-text-muted">No chats yet.</p>
					{/each}
				</div>
			</nav>

			<div class="space-y-1 border-t border-border-subtle px-3 pt-4">
				<a
					href={resolve('/settings')}
					class="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-text-muted transition-colors duration-200 hover:bg-surface-container-high hover:text-primary"
				>
					<span class="material-symbols-outlined" aria-hidden="true">settings</span>
					<span class="font-body-sm text-body-sm">Settings</span>
				</a>
			</div>
		</aside>

		<button
			type="button"
			class={['fixed inset-0 z-40 bg-black/60 md:hidden', sidebarOpen ? 'block' : 'hidden']}
			aria-label="Close sidebar"
			aria-hidden={!sidebarOpen}
			onclick={() => (sidebarOpen = false)}
		></button>

		<main class="relative flex h-full flex-1 flex-col md:ml-sidebar-width">
			<header class="sticky top-0 z-30 hidden h-16 w-full items-center justify-between border-b border-border-subtle bg-background/80 px-gutter backdrop-blur-md md:flex">
				<div class="flex items-center gap-2">
					<select
						class="rounded border border-border-subtle bg-surface-container-high px-2.5 py-1 text-[13px] font-medium text-text-primary outline-none transition-colors hover:bg-surface-variant"
						value={selectedProviderId}
						onchange={selectProvider}
						aria-label="Provider"
					>
						{#each providerOptions as provider (provider.id)}
							<option value={provider.id}>{provider.name}</option>
						{/each}
					</select>
					<input
						class="w-44 rounded border border-border-subtle bg-surface-container-high px-2.5 py-1 text-[13px] font-medium text-text-primary outline-none transition-colors hover:bg-surface-variant"
						value={selectedModel}
						oninput={(event) => (selectedModelOverride = (event.currentTarget as HTMLInputElement).value)}
						placeholder="model"
						aria-label="Model"
					/>
				</div>
				<a
					href={resolve('/settings')}
					class="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-container-high hover:text-primary"
					aria-label="Settings"
				>
					<span class="material-symbols-outlined" aria-hidden="true">settings</span>
				</a>
			</header>

			<section class="custom-scrollbar flex flex-1 flex-col overflow-y-auto px-4 pb-48 pt-8 md:pb-44">
				<div class="mx-auto flex w-full max-w-container-max-width flex-1 flex-col gap-5">
					{#if !hasProviders}
						<div class="mt-16 rounded-lg border border-border-subtle bg-surface-container-low p-6">
							<h2 class="font-headline-md text-headline-md text-primary">Add a provider to start</h2>
							{#if data.loadError}
								<p class="mt-3 font-body-sm text-body-sm text-error">{data.loadError}</p>
							{/if}
							<a class="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 font-body-sm text-body-sm font-semibold text-background" href={resolve('/settings')}>
								Open settings
							</a>
						</div>
					{:else if messages.length === 0}
						<div class="flex flex-1 items-center justify-center">
							<div class="text-center">
								<div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-border-subtle bg-surface-container-low text-primary">
									<span class="material-symbols-outlined !text-[32px]" aria-hidden="true">neurology</span>
								</div>
								<h2 class="font-headline-md text-headline-md text-primary">Ready when you are.</h2>
							</div>
						</div>
					{:else}
						{#each messages as item, index (`${index}-${item.role}`)}
							<article class={['message-row', item.role === 'user' ? 'justify-end' : 'justify-start']}>
								<div class={['message-block', item.role]}>
									{#if item.role === 'assistant' && item.thoughts.length > 0}
										<div class="thought-stack">
											{#each item.thoughts as thought (thought.contentIndex)}
												<div class={['thought-block', thought.status]}>
													<button
														type="button"
														class="thought-toggle"
														aria-expanded={thought.expanded}
														aria-controls={`thought-${index}-${thought.contentIndex}`}
														onclick={() => toggleThought(index, thought.contentIndex)}
													>
														<span
															class={['material-symbols-outlined thought-chevron', thought.expanded ? 'expanded' : '']}
															aria-hidden="true"
														>
															expand_more
														</span>
														<span>{thoughtLabel(thought)}</span>
													</button>

													{#if thought.expanded}
														<div
															id={`thought-${index}-${thought.contentIndex}`}
															class="thought-body"
														>
															{#if thought.redacted}
																<span class="thought-redacted">Thought redacted by provider</span>
															{:else if thought.text.trim()}
																{thought.text}
															{:else if thought.status === 'thinking'}
																<span class="thinking-cursor" aria-hidden="true"></span>
															{/if}
														</div>
													{/if}
												</div>
											{/each}
										</div>
							{/if}

							{#if item.role === 'assistant' && item.tools.length > 0}
								<div class="tool-stack" aria-label="Tool activity">
									{#each item.tools as tool (tool.id)}
										<div class={['tool-row', tool.status]}>
											<span class="material-symbols-outlined tool-icon" aria-hidden="true">
												{tool.status === 'running' ? 'progress_activity' : tool.status === 'failed' ? 'error' : 'check_circle'}
											</span>
											<span class="tool-label">{toolStatusLabel(tool)}</span>
										</div>
									{/each}
								</div>
							{/if}

							{#if shouldShowAssistantPlaceholder(item)}
								<span class="text-text-muted">...</span>
							{:else if item.text.length > 0}
								{#if item.role === 'assistant'}
									<div class="message-text markdown-content" {@attach assistantMarkdown(item.text)}></div>
								{:else if item.role === 'tool' && item.toolName}
									<div class="message-text">
										<span class="tool-result-label">{formatToolName(item.toolName)}</span>
										{item.text}
									</div>
								{:else}
									<div class="message-text">{item.text}</div>
								{/if}
							{/if}
						</div>
					</article>
						{/each}
					{/if}

					{#if errorText}
						<div class="rounded-lg border border-error-container bg-error-container/25 px-4 py-3 text-error">
							{errorText}
						</div>
					{/if}
				</div>
			</section>

			<div class="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-4 pt-12 md:left-sidebar-width md:pb-6">
				<div class="mx-auto max-w-container-max-width">
					<form
						class="glass-effect rounded-2xl border border-border-subtle bg-surface-container-low p-2 pl-4 shadow-[0_24px_80px_rgba(0,0,0,0.32)] transition-all duration-300 focus-within:border-outline"
						onsubmit={handleSubmit}
					>
						<div class="flex items-end gap-2">
							<textarea
								bind:value={message}
								class="custom-scrollbar max-h-48 min-h-11 flex-1 resize-none border-none bg-transparent py-2.5 font-body-md text-body-md text-text-primary outline-none placeholder:text-text-muted focus:ring-0"
								placeholder={hasProviders ? 'Message Persona...' : 'Add a provider first'}
								rows="1"
								aria-label="Message Persona"
								disabled={!hasProviders || isStreaming}
								oninput={handleMessageInput}
								{@attach autosize}
							></textarea>

							<button
								type="submit"
								class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-background transition-all hover:opacity-90 active:scale-95 disabled:scale-100 disabled:opacity-30"
								disabled={!canSend}
								aria-label="Send message"
							>
								<span class="material-symbols-outlined !text-[22px] font-bold" aria-hidden="true">arrow_upward</span>
							</button>
						</div>
					</form>
				</div>
			</div>
		</main>
	</div>
</div>

<style>
	.message-row {
		display: flex;
		width: 100%;
	}

	.message-block {
		max-width: min(100%, 720px);
		border-radius: 0.5rem;
		padding: 0.875rem 1rem;
		font-size: 16px;
		line-height: 24px;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.message-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.message-text.markdown-content {
		white-space: normal;
	}

	.markdown-content {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.markdown-content :global(p),
	.markdown-content :global(ul),
	.markdown-content :global(ol),
	.markdown-content :global(blockquote),
	.markdown-content :global(pre),
	.markdown-content :global(table) {
		margin: 0;
	}

	.markdown-content :global(h1),
	.markdown-content :global(h2),
	.markdown-content :global(h3),
	.markdown-content :global(h4),
	.markdown-content :global(h5),
	.markdown-content :global(h6) {
		margin: 0;
		color: var(--color-primary);
		font-size: 16px;
		font-weight: 600;
		line-height: 24px;
	}

	.markdown-content :global(ul),
	.markdown-content :global(ol) {
		padding-left: 1.25rem;
	}

	.markdown-content :global(li + li) {
		margin-top: 0.375rem;
	}

	.markdown-content :global(a) {
		color: var(--color-primary);
		text-decoration: underline;
		text-decoration-color: var(--color-outline);
		text-underline-offset: 0.2em;
	}

	.markdown-content :global(a:hover),
	.markdown-content :global(a:focus-visible) {
		text-decoration-color: currentColor;
	}

	.markdown-content :global(code) {
		border-radius: 0.25rem;
		background: var(--color-surface-container-high);
		color: var(--color-on-surface);
		font-family: var(--font-code);
		font-size: 0.875em;
		padding: 0.0625rem 0.25rem;
	}

	.markdown-content :global(pre) {
		max-width: 100%;
		overflow-x: auto;
		border: 1px solid var(--color-border-subtle);
		border-radius: 0.5rem;
		background: var(--color-surface-container);
		padding: 0.75rem;
	}

	.markdown-content :global(pre code) {
		display: block;
		background: transparent;
		padding: 0;
		white-space: pre;
	}

	.markdown-content :global(blockquote) {
		border-left: 2px solid var(--color-outline-variant);
		color: var(--color-on-surface-variant);
		padding-left: 0.75rem;
	}

	.markdown-content :global(hr) {
		width: 100%;
		border: 0;
		border-top: 1px solid var(--color-border-subtle);
	}

	.markdown-content :global(table) {
		display: block;
		max-width: 100%;
		overflow-x: auto;
		border-collapse: collapse;
	}

	.markdown-content :global(th),
	.markdown-content :global(td) {
		border: 1px solid var(--color-border-subtle);
		padding: 0.375rem 0.5rem;
		text-align: left;
	}

	.markdown-content :global(th) {
		background: var(--color-surface-container);
		color: var(--color-primary);
		font-weight: 600;
	}

	.markdown-content :global(img) {
		max-width: 100%;
		height: auto;
		border-radius: 0.5rem;
	}

	.message-block.user {
		background: var(--color-primary);
		color: var(--color-background);
	}

	.message-block.assistant,
	.message-block.tool,
	.message-block.system {
		border: 1px solid var(--color-border-subtle);
		background: var(--color-surface-container-low);
		color: var(--color-text-primary);
	}

	.thought-stack {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.thought-block {
		border-left: 1px solid var(--color-outline-variant);
		padding-left: 0.75rem;
		color: var(--color-text-muted);
	}

	.thought-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		border: 0;
		background: transparent;
		color: var(--color-text-muted);
		padding: 0;
		font-size: 13px;
		line-height: 20px;
		cursor: pointer;
		transition: color 150ms ease;
	}

	.thought-toggle:hover,
	.thought-toggle:focus-visible {
		color: var(--color-primary);
	}

	.thought-toggle:focus-visible {
		outline: 1px solid var(--color-outline);
		outline-offset: 3px;
		border-radius: 0.25rem;
	}

	.thought-chevron {
		font-size: 18px;
		transition: transform 150ms ease;
	}

	.thought-chevron.expanded {
		transform: rotate(180deg);
	}

	.thought-body {
		margin-top: 0.375rem;
		white-space: pre-wrap;
		color: var(--color-on-surface-variant);
		font-size: 14px;
		line-height: 20px;
	}

	.tool-stack {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.tool-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		max-width: 100%;
		border-left: 1px solid var(--color-outline-variant);
		padding-left: 0.75rem;
		color: var(--color-text-muted);
		font-size: 13px;
		line-height: 20px;
	}

	.tool-icon {
		flex: 0 0 auto;
		font-size: 18px;
	}

	.tool-row.running .tool-icon {
		animation: tool-spin 1s linear infinite;
	}

	.tool-row.failed {
		color: var(--color-error);
	}

	.tool-label {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.tool-result-label {
		display: block;
		margin-bottom: 0.25rem;
		color: var(--color-text-muted);
		font-size: 12px;
		font-weight: 600;
		line-height: 16px;
		text-transform: uppercase;
	}

	.thought-redacted {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.thinking-cursor {
		display: inline-block;
		width: 0.5rem;
		height: 1rem;
		border-radius: 9999px;
		background: var(--color-text-muted);
		animation: thinking-pulse 1s ease-in-out infinite;
		vertical-align: -0.125rem;
	}

	@keyframes thinking-pulse {
		0%,
		100% {
			opacity: 0.35;
		}

		50% {
			opacity: 1;
		}
	}

	@keyframes tool-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
