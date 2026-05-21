<script lang="ts">
	import ChatPage from '$lib/components/chat/ChatPage.svelte';

	let { data } = $props();
</script>

<ChatPage {data} />
