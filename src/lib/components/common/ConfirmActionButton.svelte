<script lang="ts">
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

	interface Props {
		title: string;
		description: string;
		confirmLabel: string;
		buttonLabel: string;
		buttonClass: string;
		icon?: string;
		disabled?: boolean;
		buttonTitle?: string;
		variant?: 'default' | 'danger';
		onConfirm: () => void | Promise<void>;
	}

	let {
		title,
		description,
		confirmLabel,
		buttonLabel,
		buttonClass,
		icon = 'delete',
		disabled = false,
		buttonTitle,
		variant = 'danger',
		onConfirm
	}: Props = $props();

	let open = $state(false);
	let confirming = $state(false);

	function requestConfirm(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		if (disabled || confirming) return;
		open = true;
	}

	function cancelConfirm() {
		if (confirming) return;
		open = false;
	}

	async function confirmAction() {
		if (confirming) return;
		confirming = true;
		try {
			await onConfirm();
			open = false;
		} finally {
			confirming = false;
		}
	}
</script>

<button
	type="button"
	class={buttonClass}
	aria-label={buttonLabel}
	title={buttonTitle}
	disabled={disabled || confirming}
	onclick={requestConfirm}
>
	<span class="material-symbols-outlined !text-[20px]" aria-hidden="true">{icon}</span>
</button>

<ConfirmDialog
	{open}
	{title}
	{description}
	{confirmLabel}
	{variant}
	onCancel={cancelConfirm}
	onConfirm={confirmAction}
/>
