<script lang="ts">
	import ConfirmActionButton from '$lib/components/common/ConfirmActionButton.svelte';

	interface Props {
		action: string;
		id: string;
		title: string;
		description: string;
		confirmLabel: string;
		buttonLabel: string;
		buttonClass: string;
		icon?: string;
		idField?: string;
	}

	let {
		action,
		id,
		title,
		description,
		confirmLabel,
		buttonLabel,
		buttonClass,
		icon = 'delete',
		idField = 'id'
	}: Props = $props();

	let deleteForm: HTMLFormElement | undefined;

	function confirmDelete() {
		deleteForm?.requestSubmit();
	}
</script>

<form bind:this={deleteForm} method="POST" {action}>
	<input type="hidden" name={idField} value={id} />
	<ConfirmActionButton
		{title}
		{description}
		{confirmLabel}
		{buttonLabel}
		{buttonClass}
		{icon}
		onConfirm={confirmDelete}
	/>
</form>
