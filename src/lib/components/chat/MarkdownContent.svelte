<script lang="ts">
	import { renderAssistantMarkdown } from '$lib/markdown';
	import type { Attachment } from 'svelte/attachments';

	interface Props {
		markdown: string;
		class?: string;
	}

	let { markdown, class: className = '' }: Props = $props();

	function renderMarkdown(source: string): Attachment<HTMLElement> {
		return (node) => {
			const html = renderAssistantMarkdown(source);
			if (node.innerHTML !== html) node.innerHTML = html;
		};
	}
</script>

<div class={className} {@attach renderMarkdown(markdown)}></div>
