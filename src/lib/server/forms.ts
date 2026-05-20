export function stringFromForm(form: FormData, key: string): string | undefined {
	const value = form.get(key);
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function booleanFromForm(form: FormData, key: string, fallback = false): boolean {
	const value = form.get(key);
	if (typeof value !== 'string') return fallback;
	return ['1', 'true', 'yes', 'on'].includes(value);
}

export function listFromLines(value: string | undefined): string[] {
	return (value ?? '')
		.split(/\r?\n|,/)
		.map((item) => item.trim())
		.filter(Boolean);
}

export function recordFromJson(value: string | undefined, label: string): Record<string, string> {
	if (!value) return {};
	const parsed = JSON.parse(value) as unknown;
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${label} must be a JSON object`);
	}

	for (const [key, item] of Object.entries(parsed)) {
		if (typeof item !== 'string') throw new Error(`${label}.${key} must be a string`);
	}

	return parsed as Record<string, string>;
}
