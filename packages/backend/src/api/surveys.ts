import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { adminAuth } from '../middleware/auth';

const router = Router();

export interface Question {
  id: string;
  type: 'multiple_choice' | 'likert' | 'open';
  text: string;
  options?: string[] | null;
}

// POST / (admin only)
router.post('/', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const {
    title,
    description,
    surveyType,
    questions,
    targetAgentIds,
    rewardBase,
    clientDeposit,
    deadline,
    createdBy,
  } = req.body;

  if (!title || !surveyType || !questions || !rewardBase || !clientDeposit || !createdBy) {
    res.status(400).json({
      error: 'Missing required fields: title, surveyType, questions, rewardBase, clientDeposit, createdBy',
    });
    return;
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: 'questions must be a non-empty array' });
    return;
  }

  const validSurveyTypes = ['market_research', 'ux_test', 'risk_assessment', 'governance'];
  if (!validSurveyTypes.includes(surveyType)) {
    res.status(400).json({
      error: `Invalid surveyType. Must be one of: ${validSurveyTypes.join(', ')}`,
    });
    return;
  }

  for (const q of questions as Question[]) {
    if (!q.id || !q.type || !q.text) {
      res.status(400).json({ error: 'Each question must have id, type, and text' });
      return;
    }
    if (!['multiple_choice', 'likert', 'open'].includes(q.type)) {
      res.status(400).json({ error: `Invalid question type: ${q.type}` });
      return;
    }
    if (q.type === 'multiple_choice' && (!q.options || q.options.length === 0)) {
      res.status(400).json({ error: `Question ${q.id}: multiple_choice requires options` });
      return;
    }
  }

  if (typeof rewardBase !== 'number' || rewardBase <= 0) {
    res.status(400).json({ error: 'rewardBase must be a positive number' });
    return;
  }

  if (typeof clientDeposit !== 'number' || clientDeposit <= 0) {
    res.status(400).json({ error: 'clientDeposit must be a positive number' });
    return;
  }

  try {
    const result = await query<{ id: string; status: string; created_at: string }>(
      `INSERT INTO surveys (title, description, survey_type, questions, target_agent_ids, reward_base, client_deposit, deadline, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, status, created_at`,
      [
        title,
        description || null,
        surveyType,
        JSON.stringify(questions),
        targetAgentIds || null,
        rewardBase,
        clientDeposit,
        deadline || null,
        createdBy,
      ]
    );

    res.status(201).json({
      id: result.rows[0].id,
      title,
      surveyType,
      status: result.rows[0].status,
      rewardBase,
      clientDeposit,
      createdAt: result.rows[0].created_at,
    });
  } catch (err) {
    console.error('[Surveys] create error:', err);
    res.status(500).json({ error: 'Failed to create survey' });
  }
});

// GET /
router.get('/', async (req: Request, res: Response): Promise<void> => {
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
      `SELECT COUNT(*) as count FROM surveys ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataParams = [...params, limitNum, offset];
    const result = await query(
      `SELECT id, title, description, survey_type, reward_base, client_deposit, status, deadline, created_by, created_at
       FROM surveys ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    res.json({
      surveys: result.rows,
      total,
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error('[Surveys] list error:', err);
    res.status(500).json({ error: 'Failed to list surveys' });
  }
});

// GET /:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const result = await query(
      `SELECT id, title, description, survey_type, questions, target_agent_ids,
              reward_base, client_deposit, status, deadline, created_by, created_at
       FROM surveys WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Survey not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Surveys] get error:', err);
    res.status(500).json({ error: 'Failed to get survey' });
  }
});

// PUT /:id/status (admin only)
router.put('/:id/status', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['draft', 'active', 'closed', 'paid'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
    });
    return;
  }

  try {
    const current = await query<{ status: string }>(
      'SELECT status FROM surveys WHERE id = $1',
      [id]
    );

    if (current.rows.length === 0) {
      res.status(404).json({ error: 'Survey not found' });
      return;
    }

    const validTransitions: Record<string, string[]> = {
      draft: ['active'],
      active: ['closed'],
      closed: ['paid'],
      paid: [],
    };

    const currentStatus = current.rows[0].status;
    if (!validTransitions[currentStatus]?.includes(status)) {
      res.status(400).json({
        error: `Invalid transition: ${currentStatus} → ${status}`,
        details: `Valid transitions from ${currentStatus}: ${validTransitions[currentStatus]?.join(', ') || 'none'}`,
      });
      return;
    }

    const result = await query(
      `UPDATE surveys SET status = $1 WHERE id = $2
       RETURNING id, title, status, created_at`,
      [status, id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Surveys] update status error:', err);
    res.status(500).json({ error: 'Failed to update survey status' });
  }
});

export default router;
