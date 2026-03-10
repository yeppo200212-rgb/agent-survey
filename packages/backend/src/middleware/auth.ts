import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { query } from '../db/client';

export interface AgentRow {
  id: string;
  name: string;
  operator_wallet: string;
  model_family: string | null;
  category: string | null;
  endpoint_url: string | null;
  is_ai_panel: boolean;
  status: string;
  quality_score: number;
}

declare global {
  namespace Express {
    interface Request {
      agent?: AgentRow;
    }
  }
}

export async function agentAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const apiKey = authHeader.slice('Bearer '.length).trim();
  if (!apiKey) {
    res.status(401).json({ error: 'Empty API key' });
    return;
  }

  const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

  try {
    const result = await query<AgentRow>(
      `SELECT id, name, operator_wallet, model_family, category, endpoint_url,
              is_ai_panel, status, quality_score
       FROM agents
       WHERE api_key_hash = $1`,
      [apiKeyHash]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    const agent = result.rows[0];
    if (agent.status !== 'active') {
      res.status(401).json({
        error: `Agent not active. Current status: ${agent.status}`,
        details: 'Contact admin to activate your agent.',
      });
      return;
    }

    req.agent = agent;
    next();
  } catch (err) {
    console.error('[Auth] agentAuth error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}

export function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey) {
    res.status(403).json({ error: 'Missing X-Admin-Key header' });
    return;
  }

  if (adminKey !== process.env.ADMIN_KEY) {
    res.status(403).json({ error: 'Invalid admin key' });
    return;
  }

  next();
}
