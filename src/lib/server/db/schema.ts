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
import type { PersistedAgentMessage } from '$lib/server/agent/messages';
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

export const users = pgTable(
	'users',
	{
		id: text('id').primaryKey(),
		name: text('name').notNull(),
		email: text('email').notNull().unique(),
		emailVerified: boolean('email_verified').notNull().default(false),
		image: text('image'),
		role: text('role').notNull().default('user'),
		banned: boolean('banned').notNull().default(false),
		banReason: text('ban_reason'),
		banExpires: timestamp('ban_expires', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		emailIdx: uniqueIndex('users_email_idx').on(table.email),
		roleIdx: index('users_role_idx').on(table.role)
	})
);

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
		ipAddress: text('ip_address'),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		impersonatedBy: text('impersonated_by')
	},
	(table) => ({
		tokenIdx: uniqueIndex('sessions_token_idx').on(table.token),
		userIdx: index('sessions_user_idx').on(table.userId)
	})
);

export const accounts = pgTable(
	'accounts',
	{
		id: text('id').primaryKey(),
		accountId: text('account_id').notNull(),
		providerId: text('provider_id').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		accessToken: text('access_token'),
		refreshToken: text('refresh_token'),
		idToken: text('id_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		userIdx: index('accounts_user_idx').on(table.userId),
		providerAccountIdx: index('accounts_provider_account_idx').on(
			table.providerId,
			table.accountId
		)
	})
);

export const verifications = pgTable(
	'verifications',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		identifierIdx: index('verifications_identifier_idx').on(table.identifier)
	})
);

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

export const userProviderPreferences = pgTable(
	'user_provider_preferences',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		providerConnectionId: uuid('provider_connection_id')
			.notNull()
			.references(() => providerConnections.id, { onDelete: 'cascade' }),
		defaultModel: text('default_model'),
		favoriteModels: jsonb('favorite_models').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
		isDefault: boolean('is_default').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		userProviderIdx: uniqueIndex('user_provider_preferences_user_provider_idx').on(
			table.userId,
			table.providerConnectionId
		),
		userDefaultIdx: uniqueIndex('user_provider_preferences_user_default_idx')
			.on(table.userId, table.isDefault)
			.where(sql`${table.isDefault} = true`)
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

export const agents = pgTable(
	'agents',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		systemPrompt: text('system_prompt').notNull().default(''),
		toolNames: jsonb('tool_names').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
		mcpServerIds: jsonb('mcp_server_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
		isDefault: boolean('is_default').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		userNameIdx: uniqueIndex('agents_user_name_idx').on(table.userId, table.name),
		defaultIdx: uniqueIndex('agents_default_idx')
			.on(table.userId, table.isDefault)
			.where(sql`${table.isDefault} = true`)
	})
);

export const chatSessions = pgTable(
	'chat_sessions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
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
		temperature: real('temperature'),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => ({
		userUpdatedAtIdx: index('chat_sessions_user_updated_at_idx').on(table.userId, table.updatedAt),
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
