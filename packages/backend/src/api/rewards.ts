import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { adminAuth } from '../middleware/auth';

const router = Router();

// POST /batch (admin only)
router.post('/batch', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { surveyId } = req.body;

  if (!surveyId) {
    res.status(400).json({ error: 'surveyId is required' });
    return;
  }

  try {
    // Verify survey exists
    const surveyCheck = await query<{ id: string; reward_base: number }>(
      'SELECT id, reward_base FROM surveys WHERE id = $1',
      [surveyId]
    );

    if (surveyCheck.rows.length === 0) {
      res.status(404).json({ error: 'Survey not found' });
      return;
    }

    // Get all scored responses without existing rewards
    const responsesResult = await query<{
      id: string;
      agent_id: string;
      reward_amount: number;
      quality_score: number;
    }>(
      `SELECT sr.id, sr.agent_id, sr.reward_amount, sr.quality_score
       FROM survey_responses sr
       WHERE sr.survey_id = $1
         AND sr.status = 'scored'
         AND sr.reward_amount IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM rewards r WHERE r.response_id = sr.id
         )`,
      [surveyId]
    );

    const scoredResponses = responsesResult.rows;

    if (scoredResponses.length === 0) {
      res.json({
        surveyId,
        rewards: [],
        totalAmount: 0,
        rewardCount: 0,
        message: 'No scored responses without existing rewards',
      });
      return;
    }

    const rewardRecords = [];
    let totalAmount = 0;

    for (const response of scoredResponses) {
      const amount = Math.round(Number(response.reward_amount) * 100) / 100;

      const result = await query<{ id: string; status: string }>(
        `INSERT INTO rewards (agent_id, response_id, amount_usdc, status)
         VALUES ($1, $2, $3, 'pending')
         RETURNING id, status`,
        [response.agent_id, response.id, amount]
      );

      // Mark response as having reward created
      await query(
        "UPDATE survey_responses SET status = 'reward_pending' WHERE id = $1",
        [response.id]
      );

      totalAmount += amount;
      rewardRecords.push({
        rewardId: result.rows[0].id,
        agentId: response.agent_id,
        responseId: response.id,
        amountUsdc: amount,
        status: result.rows[0].status,
      });
    }

    res.status(201).json({
      surveyId,
      rewards: rewardRecords,
      totalAmount: Math.round(totalAmount * 100) / 100,
      rewardCount: rewardRecords.length,
    });
  } catch (err) {
    console.error('[Rewards] batch error:', err);
    res.status(500).json({ error: 'Failed to create reward batch' });
  }
});

// GET /:agentId (admin only)
router.get('/:agentId', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { agentId } = req.params;
  const { status, page = '1', limit = '20' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
  const offset = (pageNum - 1) * limitNum;

  try {
    // Verify agent exists
    const agentCheck = await query<{ id: string }>(
      'SELECT id FROM agents WHERE id = $1',
      [agentId]
    );

    if (agentCheck.rows.length === 0) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const conditions = ['r.agent_id = $1'];
    const params: unknown[] = [agentId];

    if (status) {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    const totalEarnedResult = await query<{ total: string; pending: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_usdc ELSE 0 END), 0) as total,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_usdc ELSE 0 END), 0) as pending
       FROM rewards WHERE agent_id = $1`,
      [agentId]
    );

    const dataParams = [...params, limitNum, offset];
    const result = await query(
      `SELECT r.id, r.response_id, s.title as survey_title, r.amount_usdc,
              r.status, r.tx_hash, r.paid_at, r.created_at
       FROM rewards r
       JOIN survey_responses sr ON r.response_id = sr.id
       JOIN surveys s ON sr.survey_id = s.id
       WHERE ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    res.json({
      agentId,
      rewards: result.rows,
      totalEarned: parseFloat(totalEarnedResult.rows[0].total),
      pendingAmount: parseFloat(totalEarnedResult.rows[0].pending),
    });
  } catch (err) {
    console.error('[Rewards] get error:', err);
    res.status(500).json({ error: 'Failed to get rewards' });
  }
});

// PUT /:rewardId/mark-paid (admin only)
router.put('/:rewardId/mark-paid', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { rewardId } = req.params;
  const { txHash } = req.body;

  try {
    const result = await query<{ id: string; status: string; tx_hash: string | null; paid_at: string }>(
      `UPDATE rewards
       SET status = 'paid', tx_hash = $1, paid_at = NOW()
       WHERE id = $2 AND status = 'pending'
       RETURNING id, status, tx_hash, paid_at`,
      [txHash || null, rewardId]
    );

    if (result.rows.length === 0) {
      // Check if it exists but wasn't pending
      const existing = await query<{ status: string }>(
        'SELECT status FROM rewards WHERE id = $1',
        [rewardId]
      );
      if (existing.rows.length === 0) {
        res.status(404).json({ error: 'Reward not found' });
      } else {
        res.status(400).json({
          error: `Reward cannot be marked paid. Current status: ${existing.rows[0].status}`,
        });
      }
      return;
    }

    res.json({
      rewardId: result.rows[0].id,
      status: result.rows[0].status,
      txHash: result.rows[0].tx_hash,
      paidAt: result.rows[0].paid_at,
    });
  } catch (err) {
    console.error('[Rewards] mark-paid error:', err);
    res.status(500).json({ error: 'Failed to mark reward as paid' });
  }
});

export default router;
