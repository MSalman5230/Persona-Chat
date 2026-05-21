export function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function assertJsonObject(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new Error(`${label} must be a JSON object`);
	}
	return value;
}

export function assertStringRecord(value: unknown, label: string): Record<string, string> {
	const record = assertJsonObject(value, label);

	for (const [key, item] of Object.entries(record)) {
		if (typeof item !== 'string') throw new Error(`${label}.${key} must be a string`);
	}

	return record as Record<string, string>;
}

export function tryParseJsonObject(value: string | undefined, label: string): Record<string, unknown> {
	if (!value) return {};
	const parsed = JSON.parse(value) as unknown;
	return assertJsonObject(parsed, label);
}

export function tryParseStringRecord(value: string | undefined, label: string): Record<string, string> {
	if (!value) return {};
	const parsed = JSON.parse(value) as unknown;
	return assertStringRecord(parsed, label);
}
