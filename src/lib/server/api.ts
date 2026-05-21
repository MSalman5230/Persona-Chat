import { error } from '@sveltejs/kit';
import { z } from 'zod';

export function apiErrorMessage(value: unknown, fallback: string): string {
	if (value instanceof z.ZodError) return value.issues[0]?.message ?? fallback;
	if (value instanceof SyntaxError) return 'Invalid JSON request body';
	return value instanceof Error ? value.message : fallback;
}

export async function parseJsonRequest<TSchema extends z.ZodType>(
	request: Request,
	schema: TSchema,
	fallback: string
): Promise<z.output<TSchema>> {
	try {
		return schema.parse(await request.json());
	} catch (cause) {
		error(400, apiErrorMessage(cause, fallback));
	}
}

export async function readJsonRequest(request: Request, fallback: string): Promise<unknown> {
	try {
		return await request.json();
	} catch (cause) {
		error(400, apiErrorMessage(cause, fallback));
	}
}

export function rethrowValidationAsBadRequest(cause: unknown, fallback: string): never {
	if (cause instanceof z.ZodError) {
		error(400, apiErrorMessage(cause, fallback));
	}
	throw cause;
}
