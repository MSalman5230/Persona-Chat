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

export const providerKind = pgEnum('provider_kind', ['built_in', 'custom']);
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
		kind: providerKind('kind').notNull().default('built_in'),
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

export const systemPromptPresets = pgTable(
	'system_prompt_presets',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		name: text('name').notNull(),
		prompt: text('prompt').notNull(),
		isDefault: boolean('is_default').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		nameIdx: uniqueIndex('system_prompt_presets_name_idx').on(table.name),
		defaultIdx: uniqueIndex('system_prompt_presets_default_idx')
			.on(table.isDefault)
			.where(sql`${table.isDefault} = true`)
	})
);

export const chatSessions = pgTable(
	'chat_sessions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		title: text('title').notNull().default('New chat'),
		providerConnectionId: uuid('provider_connection_id').references(() => providerConnections.id, {
			onDelete: 'set null'
		}),
		providerId: text('provider_id'),
		modelId: text('model_id'),
		thinkingLevel: text('thinking_level').notNull().default('medium'),
		systemPrompt: text('system_prompt').notNull().default(''),
		temperature: real('temperature'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		createdAtIdx: index('chat_sessions_created_at_idx').on(table.createdAt)
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
		piMessage: jsonb('pi_message').$type<Record<string, unknown>>().notNull(),
		display: jsonb('display').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		sessionIdx: index('chat_messages_session_idx').on(table.sessionId),
		sequenceIdx: index('chat_messages_sequence_idx').on(table.sessionId, table.sequence)
	})
);
