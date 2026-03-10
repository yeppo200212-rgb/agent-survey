import dotenv from 'dotenv';
dotenv.config();

import { pool } from './client';

const MIGRATION_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  operator_wallet TEXT NOT NULL,
  model_family TEXT,
  category TEXT,
  endpoint_url TEXT,
  api_key_hash TEXT UNIQUE NOT NULL,
  is_ai_panel BOOLEAN DEFAULT FALSE,
  stake_amount DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'quarantine',
  quality_score DECIMAL(5,2) DEFAULT 50,
  registered_ip TEXT,
  reasoning_hashes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  survey_type TEXT NOT NULL,
  questions JSONB NOT NULL,
  target_agent_ids UUID[],
  reward_base DECIMAL(10,2) NOT NULL,
  client_deposit DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'draft',
  deadline TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID REFERENCES surveys(id),
  agent_id UUID REFERENCES agents(id),
  answers JSONB NOT NULL,
  wallet_signature TEXT,
  processing_ms INTEGER,
  quality_score DECIMAL(5,2),
  quality_breakdown JSONB,
  reward_amount DECIMAL(10,2),
  behavioral_signals JSONB,
  status TEXT DEFAULT 'pending',
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  response_id UUID REFERENCES survey_responses(id),
  amount_usdc DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending',
  tx_hash TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_api_key_hash ON agents(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_surveys_status ON surveys(status);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_agent_id ON survey_responses(agent_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_status ON survey_responses(status);
CREATE INDEX IF NOT EXISTS idx_rewards_agent_id ON rewards(agent_id);
CREATE INDEX IF NOT EXISTS idx_rewards_status ON rewards(status);
`;

async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('[Migrate] Starting database migration...');
    await client.query(MIGRATION_SQL);
    console.log('[Migrate] Migration completed successfully.');
    console.log('[Migrate] Tables created: agents, surveys, survey_responses, rewards');
    console.log('[Migrate] Indexes created for performance.');
  } catch (err) {
    console.error('[Migrate] Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
