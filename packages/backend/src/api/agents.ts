import { Router, Request, Response } from 'express';
import { createHash, randomUUID } from 'crypto';
import { query } from '../db/client';
import { adminAuth } from '../middleware/auth';

const router = Router();

// POST /register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { name, operatorWallet, modelFamily, category, endpointUrl } = req.body;

  if (!name || !operatorWallet) {
    res.status(400).json({ error: 'name and operatorWallet are required' });
    return;
  }

  if (typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }

  if (typeof operatorWallet !== 'string' || !operatorWallet.startsWith('0x')) {
    res.status(400).json({ error: 'operatorWallet must be a valid EVM address starting with 0x' });
    return;
  }

  const apiKey = randomUUID();
  const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
  const registeredIp = req.ip || req.socket.remoteAddress || null;

  try {
    const result = await query<{ id: string; status: string }>(
      `INSERT INTO agents (name, operator_wallet, model_family, category, endpoint_url, api_key_hash, registered_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, status`,
      [
        name.trim(),
        operatorWallet,
        modelFamily || null,
        category || null,
        endpointUrl || null,
        apiKeyHash,
        registeredIp,
      ]
    );

    const agent = result.rows[0];
    res.status(201).json({
      agentId: agent.id,
      apiKey,
      status: agent.status,
      message: 'Agent registered. Pending admin activation. Save your API key — it will not be shown again.',
    });
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23505') {
      // Unique violation on api_key_hash — extremely rare, retry
      res.status(500).json({ error: 'Registration conflict, please retry' });
      return;
    }
    console.error('[Agents] register error:', err);
    res.status(500).json({ error: 'Failed to register agent' });
  }
});

// GET / (admin only)
router.get('/', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { status, page = '1', limit = '20' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM agents ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataParams = [...params, limitNum, offset];
    const result = await query(
      `SELECT id, name, operator_wallet, model_family, category, endpoint_url,
              is_ai_panel, stake_amount, status, quality_score, registered_ip, created_at
       FROM agents ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    res.json({
      agents: result.rows,
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error('[Agents] list error:', err);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

// GET /:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await query(
      `SELECT id, name, operator_wallet, model_family, category, endpoint_url,
              is_ai_panel, stake_amount, status, quality_score, created_at
       FROM agents
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Agents] get error:', err);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// POST /:id/activate (admin only)
router.post('/:id/activate', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status = 'active' } = req.body;

  const validStatuses = ['active', 'suspended', 'quarantine'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
    });
    return;
  }

  try {
    const result = await query<{ id: string; status: string; name: string }>(
      `UPDATE agents SET status = $1 WHERE id = $2
       RETURNING id, name, status`,
      [status, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json({
      ...result.rows[0],
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Agents] activate error:', err);
    res.status(500).json({ error: 'Failed to update agent status' });
  }
});

export default router;
