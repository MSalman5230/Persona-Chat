<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		groupMessagesIntoConversationTurns,
		shouldShowAssistantTurnPlaceholder,
		thoughtLabel,
		toolActivityLabel,
		type UiMessage
	} from '$lib/client/chat';
	import MarkdownContent from './MarkdownContent.svelte';

	interface Props {
		hasProviders: boolean;
		loadError: string | null;
		messages: UiMessage[];
		errorText: string;
		isStreaming: boolean;
		now: number;
		onToggleThought: (turnKey: string, thoughtKey: string, expanded: boolean) => void;
	}

	let {
		hasProviders,
		loadError,
		messages,
		errorText,
		isStreaming,
		now,
		onToggleThought
	}: Props = $props();

	let turns = $derived(groupMessagesIntoConversationTurns(messages, now));
</script>

<section class="custom-scrollbar flex flex-1 flex-col overflow-y-auto px-4 pb-48 pt-8 md:pb-44">
	<div class="mx-auto flex w-full max-w-container-max-width flex-1 flex-col gap-5">
		{#if !hasProviders}
			<div class="mt-16 rounded-lg border border-border-subtle bg-surface-container-low p-6">
				<h2 class="font-headline-md text-headline-md text-primary">Add a provider to start</h2>
				{#if loadError}
					<p class="mt-3 font-body-sm text-body-sm text-error">{loadError}</p>
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
			{#each turns as turn, turnIndex (turn.key)}
				{#if turn.user}
					<article class="message-row justify-end">
						<div class="message-block user">
							<div class="message-text">{turn.user.text}</div>
						</div>
					</article>
				{/if}

				{#each turn.systemMessages as item (item.clientKey)}
					<article class="message-row justify-start">
						<div class="message-block system">
							<div class="message-text">{item.text}</div>
						</div>
					</article>
				{/each}

				{#if turn.assistantMessages.length > 0}
					<article class="message-row justify-start">
						<div class="message-block assistant">
							{#if turn.thoughts.length > 0 || turn.tools.length > 0}
								<div class="activity-stack" aria-label="Thinking and tool activity">
									{#each turn.displayThoughts as thought (thought.thoughtKey)}
										<div class={['thought-block', thought.status]}>
											<button
												type="button"
												class="thought-toggle"
												aria-expanded={thought.expanded}
												aria-controls={`thought-${turnIndex}-${thought.thoughtKey}`}
												onclick={() => onToggleThought(turn.key, thought.thoughtKey, !thought.expanded)}
											>
												<span
													class={['material-symbols-outlined thought-chevron', thought.expanded ? 'expanded' : '']}
													aria-hidden="true"
												>
													expand_more
												</span>
												<span>{thoughtLabel(thought, now)}</span>
											</button>

											{#if thought.expanded}
												<div
													id={`thought-${turnIndex}-${thought.thoughtKey}`}
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

									{#each turn.tools as tool (tool.toolKey)}
										<div class={['tool-row', tool.status]}>
											<span class="material-symbols-outlined tool-icon" aria-hidden="true">
												{tool.status === 'running' ? 'progress_activity' : tool.status === 'failed' ? 'error' : 'check_circle'}
											</span>
											<span class="tool-label">{toolActivityLabel(tool)}</span>
										</div>
									{/each}
								</div>
							{/if}

							{#if shouldShowAssistantTurnPlaceholder(turn, isStreaming && turnIndex === turns.length - 1)}
								<span class="text-text-muted">...</span>
							{:else if turn.assistantText.length > 0}
								<MarkdownContent class="message-text markdown-content" markdown={turn.assistantText} />
							{/if}
						</div>
					</article>
				{/if}
			{/each}
		{/if}

		{#if errorText}
			<div class="rounded-lg border border-error-container bg-error-container/25 px-4 py-3 text-error">
				{errorText}
			</div>
		{/if}
	</div>
</section>

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

	.activity-stack {
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
