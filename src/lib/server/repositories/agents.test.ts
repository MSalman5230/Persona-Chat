import { beforeEach, describe, expect, it, vi } from 'vitest';

type AgentRecord = {
	id: string;
	userId: string;
	name: string;
	systemPrompt: string;
	toolNames: string[];
	mcpServerIds: string[];
	isDefault: boolean;
	createdAt: Date;
	updatedAt: Date;
};

const fakeDb = vi.hoisted(() => {
	type Row = {
		id: string;
		userId: string;
		name: string;
		systemPrompt: string;
		toolNames: string[];
		mcpServerIds: string[];
		isDefault: boolean;
		createdAt: Date;
		updatedAt: Date;
	};

	const columnFields: Record<string, keyof Row> = {
		created_at: 'createdAt',
		id: 'id',
		is_default: 'isDefault',
		name: 'name',
		user_id: 'userId'
	};

	let rows: Row[] = [];
	let sequence = 0;

	function clone(row: Row): Row {
		return {
			...row,
			toolNames: [...row.toolNames],
			mcpServerIds: [...row.mcpServerIds]
		};
	}

	function chunkText(chunk: unknown): string {
		const value = (chunk as { value?: unknown }).value;
		return Array.isArray(value) ? value.join('') : '';
	}

	function hasParamValue(chunk: unknown): chunk is { value: unknown } {
		return Object.prototype.hasOwnProperty.call(chunk ?? {}, 'value') && !Array.isArray((chunk as { value?: unknown }).value);
	}

	function matches(condition: unknown, row: Row): boolean {
		const chunks = (condition as { queryChunks?: unknown[] } | undefined)?.queryChunks;
		if (!chunks) return true;

		const column = chunks.find((chunk): chunk is { name: string } => typeof (chunk as { name?: unknown }).name === 'string');
		const param = chunks.find(hasParamValue);
		if (column && param) {
			const field = columnFields[column.name];
			const operator = chunks.map(chunkText).join('');
			if (operator.includes('<>')) return row[field] !== param.value;
			if (operator.includes('=')) return row[field] === param.value;
		}

		const nested = chunks.filter((chunk) => Array.isArray((chunk as { queryChunks?: unknown }).queryChunks));
		return nested.length === 0 ? true : nested.every((chunk) => matches(chunk, row));
	}

	function orderField(order: unknown): keyof Row | undefined {
		const chunks = (order as { queryChunks?: unknown[] } | undefined)?.queryChunks;
		const column = chunks?.find((chunk): chunk is { name: string } => typeof (chunk as { name?: unknown }).name === 'string');
		return column ? columnFields[column.name] : undefined;
	}

	function assertSingleDefault() {
		const defaultsByUser = new Map<string, number>();
		for (const row of rows) {
			if (!row.isDefault) continue;
			defaultsByUser.set(row.userId, (defaultsByUser.get(row.userId) ?? 0) + 1);
		}
		for (const count of defaultsByUser.values()) {
			if (count > 1) throw new Error('duplicate default agent');
		}
	}

	class SelectBuilder {
		private condition: unknown;
		private limitCount: number | undefined;
		private order: unknown;

		from() {
			return this;
		}

		where(condition: unknown) {
			this.condition = condition;
			return this;
		}

		orderBy(order: unknown) {
			this.order = order;
			return this;
		}

		limit(count: number) {
			this.limitCount = count;
			return this;
		}

		private execute() {
			let result = rows.filter((row) => matches(this.condition, row));
			const field = orderField(this.order);
			if (field) {
				result = [...result].sort((a, b) => {
					const left = a[field];
					const right = b[field];
					if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
					return String(left).localeCompare(String(right));
				});
			}
			if (this.limitCount !== undefined) result = result.slice(0, this.limitCount);
			return result.map(clone);
		}

		then<TResult1 = Row[], TResult2 = never>(
			onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
		}
	}

	class InsertBuilder {
		private value: Partial<Row> | undefined;

		values(value: Partial<Row>) {
			this.value = value;
			return this;
		}

		async returning() {
			const now = new Date(`2026-05-25T00:00:${String(++sequence).padStart(2, '0')}.000Z`);
			const row: Row = {
				id: `agent-${sequence}`,
				userId: '',
				name: '',
				systemPrompt: '',
				toolNames: [],
				mcpServerIds: [],
				isDefault: false,
				createdAt: now,
				updatedAt: now,
				...this.value
			};
			rows.push(row);
			assertSingleDefault();
			return [clone(row)];
		}
	}

	class UpdateBuilder {
		private condition: unknown;
		private patch: Partial<Row> = {};
		private executed = false;
		private result: Row[] = [];

		set(patch: Partial<Row>) {
			this.patch = patch;
			return this;
		}

		where(condition: unknown) {
			this.condition = condition;
			return this;
		}

		private execute() {
			if (this.executed) return this.result;
			this.executed = true;
			this.result = [];
			rows = rows.map((row) => {
				if (!matches(this.condition, row)) return row;
				const next = { ...row, ...this.patch };
				this.result.push(clone(next));
				return next;
			});
			assertSingleDefault();
			return this.result;
		}

		returning() {
			return Promise.resolve(this.execute().map(clone));
		}

		then<TResult1 = Row[], TResult2 = never>(
			onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
			onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
		) {
			return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
		}
	}

	class DeleteBuilder {
		private condition: unknown;

		where(condition: unknown) {
			this.condition = condition;
			rows = rows.filter((row) => !matches(this.condition, row));
			assertSingleDefault();
			return Promise.resolve();
		}
	}

	const db = {
		delete: vi.fn(() => new DeleteBuilder()),
		insert: vi.fn(() => new InsertBuilder()),
		select: vi.fn(() => new SelectBuilder()),
		transaction: vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db)),
		update: vi.fn(() => new UpdateBuilder())
	};

	return {
		db,
		defaultRows: () => rows.filter((row) => row.isDefault).map(clone),
		reset: () => {
			rows = [];
			sequence = 0;
			vi.clearAllMocks();
		},
		rows: () => rows.map(clone),
		setRows: (nextRows: Row[]) => {
			rows = nextRows.map(clone);
			sequence = 0;
			assertSingleDefault();
		}
	};
});

vi.mock('$lib/server/db', () => ({
	db: fakeDb.db
}));

vi.mock('./mcp', () => ({
	listMcpServersForUser: vi.fn(async () => [])
}));

import {
	createAgent,
	deleteAgent,
	updateAgent,
	updateAgentDefault
} from './agents';

const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const userId = 'user-1';

function agentRow(overrides: Partial<AgentRecord> & Pick<AgentRecord, 'id' | 'name'>): AgentRecord {
	const createdAt = overrides.createdAt ?? new Date('2026-05-25T00:00:00.000Z');
	return {
		systemPrompt: '',
		userId,
		toolNames: [],
		mcpServerIds: [],
		isDefault: false,
		updatedAt: createdAt,
		createdAt,
		...overrides
	};
}

describe('agent repository default invariant', () => {
	beforeEach(() => {
		fakeDb.reset();
	});

	it('promotes the first created agent even when the input opts out of default', async () => {
		const created = await createAgent(userId, {
			name: 'First',
			systemPrompt: '',
			toolNames: [],
			mcpServerIds: [],
			isDefault: false
		});

		expect(created).toMatchObject({ name: 'First', isDefault: true });
		expect(fakeDb.defaultRows().map((agent) => agent.name)).toEqual(['First']);
	});

	it('creates a second default without violating the unique default invariant', async () => {
		fakeDb.setRows([
			agentRow({
				id: firstId,
				name: 'First',
				isDefault: true,
				createdAt: new Date('2026-05-25T00:00:00.000Z')
			})
		]);

		const created = await createAgent(userId, {
			name: 'Second',
			systemPrompt: '',
			toolNames: [],
			mcpServerIds: [],
			isDefault: true
		});

		expect(created).toMatchObject({ name: 'Second', isDefault: true });
		expect(fakeDb.defaultRows().map((agent) => agent.name)).toEqual(['Second']);
	});

	it('keeps the current default when a full save submits isDefault false', async () => {
		fakeDb.setRows([
			agentRow({ id: firstId, name: 'First', isDefault: true }),
			agentRow({ id: secondId, name: 'Second', createdAt: new Date('2026-05-25T00:01:00.000Z') })
		]);

		const updated = await updateAgent(userId, firstId, {
			name: 'First renamed',
			systemPrompt: '',
			toolNames: [],
			mcpServerIds: [],
			isDefault: false
		});

		expect(updated).toMatchObject({ name: 'First renamed', isDefault: true });
		expect(fakeDb.defaultRows().map((agent) => agent.id)).toEqual([firstId]);
	});

	it('sets a non-default agent as default and clears the previous default first', async () => {
		fakeDb.setRows([
			agentRow({ id: firstId, name: 'First', isDefault: true }),
			agentRow({ id: secondId, name: 'Second', createdAt: new Date('2026-05-25T00:01:00.000Z') })
		]);

		const updated = await updateAgentDefault(userId, secondId, { isDefault: true });

		expect(updated).toMatchObject({ id: secondId, isDefault: true });
		expect(fakeDb.defaultRows().map((agent) => agent.id)).toEqual([secondId]);
	});

	it('promotes a fallback when explicitly clearing the default', async () => {
		fakeDb.setRows([
			agentRow({ id: firstId, name: 'First', isDefault: true }),
			agentRow({ id: secondId, name: 'Second', createdAt: new Date('2026-05-25T00:01:00.000Z') })
		]);

		const updated = await updateAgentDefault(userId, firstId, { isDefault: false });

		expect(updated).toMatchObject({ id: firstId, isDefault: false });
		expect(fakeDb.defaultRows().map((agent) => agent.id)).toEqual([secondId]);
	});

	it('promotes a fallback after deleting the default', async () => {
		fakeDb.setRows([
			agentRow({ id: firstId, name: 'First', isDefault: true }),
			agentRow({ id: secondId, name: 'Second', createdAt: new Date('2026-05-25T00:01:00.000Z') })
		]);

		await deleteAgent(userId, firstId);

		expect(fakeDb.rows().map((agent) => agent.id)).toEqual([secondId]);
		expect(fakeDb.defaultRows().map((agent) => agent.id)).toEqual([secondId]);
	});

	it('keeps default agents isolated per user', async () => {
		fakeDb.setRows([
			agentRow({ id: firstId, userId: 'user-1', name: 'Researcher', isDefault: true }),
			agentRow({ id: secondId, userId: 'user-2', name: 'Researcher', isDefault: true })
		]);

		const created = await createAgent('user-2', {
			name: 'Writer',
			systemPrompt: '',
			toolNames: [],
			mcpServerIds: [],
			isDefault: true
		});

		expect(created).toMatchObject({ name: 'Writer', isDefault: true });
		expect(
			fakeDb
				.rows()
				.filter((agent) => agent.userId === 'user-1' && agent.isDefault)
				.map((agent) => agent.id)
		).toEqual([firstId]);
		expect(
			fakeDb
				.rows()
				.filter((agent) => agent.userId === 'user-2' && agent.isDefault)
				.map((agent) => agent.name)
		).toEqual(['Writer']);
	});
});
