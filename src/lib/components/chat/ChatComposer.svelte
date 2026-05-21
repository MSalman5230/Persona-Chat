<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	interface Props {
		message: string;
		hasProviders: boolean;
		isStreaming: boolean;
		canSend: boolean;
		settingsOpen: boolean;
		onSubmit: () => void | Promise<void>;
		onFocusReady?: (focus: (() => void) | undefined) => void;
	}

	let {
		message = $bindable(''),
		hasProviders,
		isStreaming,
		canSend,
		settingsOpen,
		onSubmit,
		onFocusReady
	}: Props = $props();

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
		onFocusReady?.(focus);

		return () => {
			onFocusReady?.(undefined);
		};
	};

	function handleMessageInput(event: Event) {
		resizeTextarea(event.currentTarget as HTMLTextAreaElement);
	}

	function handleMessageKeydown(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;

		event.preventDefault();
		if (!canSend) return;

		(event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		void onSubmit();
	}
</script>

<div
	class={[
		'fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-4 pt-12 transition-[right] duration-300 md:left-sidebar-width md:pb-6',
		settingsOpen ? 'md:right-[320px]' : 'md:right-0'
	]}
>
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
					onkeydown={handleMessageKeydown}
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
