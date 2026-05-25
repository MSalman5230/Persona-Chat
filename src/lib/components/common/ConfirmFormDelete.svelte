<script lang="ts">
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

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

	let deleteForm: HTMLFormElement | null = null;
	let open = $state(false);

	function requestDelete(event: SubmitEvent) {
		event.preventDefault();
		deleteForm = event.currentTarget as HTMLFormElement;
		open = true;
	}

	function cancelDelete() {
		open = false;
		deleteForm = null;
	}

	function confirmDelete() {
		const form = deleteForm;
		open = false;
		deleteForm = null;
		form?.submit();
	}
</script>

<form method="POST" {action} onsubmit={requestDelete}>
	<input type="hidden" name={idField} value={id} />
	<button class={buttonClass} aria-label={buttonLabel}>
		<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">{icon}</span>
	</button>
</form>

<ConfirmDialog
	{open}
	{title}
	{description}
	{confirmLabel}
	variant="danger"
	onCancel={cancelDelete}
	onConfirm={confirmDelete}
/>
