ALTER TABLE "provider_connections" ADD COLUMN "favorite_models" jsonb DEFAULT '[]'::jsonb NOT NULL;
