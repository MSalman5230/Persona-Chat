import { sql } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	real,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import type { PersistedAgentMessage } from '$lib/server/agent/runtime';
import type { ChatMessageDisplay } from '$lib/shared/chat-display';

export const mcpTransport = pgEnum('mcp_transport', ['stdio', 'streamable_http', 'sse']);
export const mcpStatus = pgEnum('mcp_status', ['unknown', 'ok', 'error']);

export type EncryptedJsonPayload = {
	version: 1;
	iv: string;
	tag: string;
	ciphertext: string;
};

export type ProviderSecretPayload = {
	apiKey?: string;
	headers?: Record<string, string>;
};

export type McpSecretPayload = {
	env?: Record<string, string>;
	headers?: Record<string, string>;
};

export const providerConnections = pgTable(
	'provider_connections',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		name: text('name').notNull(),
		providerId: text('provider_id').notNull(),
		api: text('api').notNull().default('openai'),
		baseUrl: text('base_url'),
		defaultModel: text('default_model').notNull(),
		defaultThinkingLevel: text('default_thinking_level').notNull().default('medium'),
		authHeader: boolean('auth_header').notNull().default(true),
		models: jsonb('models').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
		favoriteModels: jsonb('favorite_models').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
		config: jsonb('config').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
		secret: jsonb('secret').$type<EncryptedJsonPayload | null>(),
		enabled: boolean('enabled').notNull().default(true),
		isDefault: boolean('is_default').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		providerIdx: index('provider_connections_provider_idx').on(table.providerId),
		defaultIdx: index('provider_connections_default_idx').on(table.isDefault)
	})
);

export const mcpServers = pgTable(
	'mcp_servers',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull().unique(),
		transport: mcpTransport('transport').notNull(),
		command: text('command'),
		args: jsonb('args').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
		cwd: text('cwd'),
		url: text('url'),
		secret: jsonb('secret').$type<EncryptedJsonPayload | null>(),
		enabled: boolean('enabled').notNull().default(true),
		status: mcpStatus('status').notNull().default('unknown'),
		lastError: text('last_error'),
		lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		enabledIdx: index('mcp_servers_enabled_idx').on(table.enabled),
		slugIdx: index('mcp_servers_slug_idx').on(table.slug)
	})
);

export const customInstructionPresets = pgTable(
	'custom_instruction_presets',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		name: text('name').notNull(),
		instruction: text('instruction').notNull(),
		isDefault: boolean('is_default').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		nameIdx: uniqueIndex('custom_instruction_presets_name_idx').on(table.name),
		defaultIdx: uniqueIndex('custom_instruction_presets_default_idx')
			.on(table.isDefault)
			.where(sql`${table.isDefault} = true`)
	})
);

export const agents = pgTable(
	'agents',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		name: text('name').notNull(),
		systemPrompt: text('system_prompt').notNull().default(''),
		toolNames: jsonb('tool_names').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
		mcpServerIds: jsonb('mcp_server_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
		isDefault: boolean('is_default').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		nameIdx: uniqueIndex('agents_name_idx').on(table.name),
		defaultIdx: uniqueIndex('agents_default_idx')
			.on(table.isDefault)
			.where(sql`${table.isDefault} = true`)
	})
);

export const chatSessions = pgTable(
	'chat_sessions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		title: text('title').notNull().default('New chat'),
		agentId: uuid('agent_id').references(() => agents.id, {
			onDelete: 'set null'
		}),
		providerConnectionId: uuid('provider_connection_id').references(() => providerConnections.id, {
			onDelete: 'set null'
		}),
		providerId: text('provider_id'),
		modelId: text('model_id'),
		thinkingLevel: text('thinking_level'),
		customInstruction: text('custom_instruction').notNull().default(''),
		temperature: real('temperature'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		createdAtIdx: index('chat_sessions_created_at_idx').on(table.createdAt)
	})
);

export const chatRuns = pgTable(
	'chat_runs',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		sessionId: uuid('session_id')
			.notNull()
			.references(() => chatSessions.id, { onDelete: 'cascade' }),
		status: text('status').notNull().default('running'),
		errorText: text('error_text'),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
		completedAt: timestamp('completed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		sessionIdx: index('chat_runs_session_idx').on(table.sessionId),
		activeSessionIdx: uniqueIndex('chat_runs_active_session_idx')
			.on(table.sessionId)
			.where(sql`${table.status} = 'running'`)
	})
);

export const chatMessages = pgTable(
	'chat_messages',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		sessionId: uuid('session_id')
			.notNull()
			.references(() => chatSessions.id, { onDelete: 'cascade' }),
		sequence: integer('sequence').notNull(),
		role: text('role').notNull(),
		contentText: text('content_text').notNull().default(''),
		piMessage: jsonb('pi_message').$type<PersistedAgentMessage>().notNull(),
		display: jsonb('display').$type<ChatMessageDisplay>().notNull().default(sql`'{}'::jsonb`),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		sessionIdx: index('chat_messages_session_idx').on(table.sessionId),
		sequenceIdx: uniqueIndex('chat_messages_sequence_idx').on(table.sessionId, table.sequence)
	})
);
