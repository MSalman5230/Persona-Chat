<script lang="ts">
	import type { Attachment } from 'svelte/attachments';

	interface Props {
		markdown: string;
		class?: string;
	}

	let { markdown, class: className = '' }: Props = $props();

	function renderMarkdown(source: string): Attachment<HTMLElement> {
		return (node) => {
			let cancelled = false;
			node.textContent = '';

			if (source.trim()) {
				import('$lib/markdown')
					.then(({ renderAssistantMarkdown }) => {
						if (!cancelled) node.innerHTML = renderAssistantMarkdown(source);
					})
					.catch(() => {
						if (!cancelled) node.textContent = '';
					});
			}

			return () => {
				cancelled = true;
			};
		};
	}
</script>

<div class={className} {@attach renderMarkdown(markdown)}></div>
