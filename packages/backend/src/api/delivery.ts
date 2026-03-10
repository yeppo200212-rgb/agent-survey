import { Router, Request, Response } from 'express';
import { createHmac } from 'crypto';
import axios from 'axios';
import { query } from '../db/client';
import { adminAuth, agentAuth } from '../middleware/auth';

const router = Router();

interface SurveyRow {
  id: string;
  title: string;
  questions: unknown;
  reward_base: number;
  status: string;
  deadline: string | null;
  target_agent_ids: string[] | null;
}

interface AgentRow {
  id: string;
  name: string;
  endpoint_url: string | null;
  status: string;
}

// POST /:id/deliver (admin only)
router.post('/:id/deliver', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const surveyResult = await query<SurveyRow>(
      `SELECT id, title, questions, reward_base, status, deadline, target_agent_ids
       FROM surveys WHERE id = $1`,
      [id]
    );

    if (surveyResult.rows.length === 0) {
      res.status(404).json({ error: 'Survey not found' });
      return;
    }

    const survey = surveyResult.rows[0];
    if (survey.status !== 'active') {
      res.status(400).json({
        error: `Survey must be active to deliver. Current status: ${survey.status}`,
      });
      return;
    }

    // Get target agents
    let agentQuery: string;
    let agentParams: unknown[];

    if (survey.target_agent_ids && survey.target_agent_ids.length > 0) {
      agentQuery = `SELECT id, name, endpoint_url FROM agents WHERE status = 'active' AND id = ANY($1)`;
      agentParams = [survey.target_agent_ids];
    } else {
      agentQuery = `SELECT id, name, endpoint_url FROM agents WHERE status = 'active'`;
      agentParams = [];
    }

    const agentResult = await query<AgentRow>(agentQuery, agentParams);
    const agents = agentResult.rows;

    if (agents.length === 0) {
      res.json({
        surveyId: id,
        delivered: 0,
        skipped: 0,
        agents: [],
        message: 'No active agents to deliver to',
      });
      return;
    }

    const deliveredAt = new Date().toISOString();
    const deliveryResults: Array<{
      agentId: string;
      name: string;
      endpointUrl: string | null;
      deliveryStatus: string;
    }> = [];

    let deliveredCount = 0;
    let skippedCount = 0;

    const hmacSecret = process.env.PLATFORM_HMAC_SECRET;

    for (const agent of agents) {
      if (!agent.endpoint_url) {
        skippedCount++;
        deliveryResults.push({
          agentId: agent.id,
          name: agent.name,
          endpointUrl: null,
          deliveryStatus: 'skipped_no_endpoint',
        });
        continue;
      }

      const payload = {
        surveyId: survey.id,
        title: survey.title,
        questions: survey.questions,
        rewardEstimate: Number(survey.reward_base),
        deadline: survey.deadline,
        deliveredAt,
      };

      const payloadStr = JSON.stringify(payload);
      const signature = hmacSecret
        ? createHmac('sha256', hmacSecret).update(payloadStr).digest('hex')
        : 'no-secret-configured';

      // Fire-and-forget
      axios
        .post(agent.endpoint_url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Platform-Signature': signature,
          },
          timeout: 5000,
        })
        .catch((err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[Delivery] Failed to deliver to agent ${agent.id} (${agent.endpoint_url}): ${errMsg}`);
        });

      deliveredCount++;
      deliveryResults.push({
        agentId: agent.id,
        name: agent.name,
        endpointUrl: agent.endpoint_url,
        deliveryStatus: 'sent',
      });
    }

    res.json({
      surveyId: id,
      delivered: deliveredCount,
      skipped: skippedCount,
      agents: deliveryResults,
    });
  } catch (err) {
    console.error('[Delivery] deliver error:', err);
    res.status(500).json({ error: 'Failed to deliver survey' });
  }
});

// GET /pending (agent auth)
router.get('/pending', agentAuth, async (req: Request, res: Response): Promise<void> => {
  const agentId = req.agent!.id;

  try {
    // Get active surveys that the agent hasn't responded to yet,
    // where the agent is in targetAgentIds or targetAgentIds is null
    const result = await query(
      `SELECT s.id as "surveyId", s.title, s.questions, s.reward_base as "rewardEstimate", s.deadline
       FROM surveys s
       WHERE s.status = 'active'
         AND (s.deadline IS NULL OR s.deadline > NOW())
         AND (s.target_agent_ids IS NULL OR $1 = ANY(s.target_agent_ids))
         AND NOT EXISTS (
           SELECT 1 FROM survey_responses sr
           WHERE sr.survey_id = s.id AND sr.agent_id = $1
         )
       ORDER BY s.created_at DESC`,
      [agentId]
    );

    const surveys = result.rows.map((row) => ({
      surveyId: row.surveyId,
      title: row.title,
      questions: row.questions,
      rewardEstimate: Number(row.rewardEstimate),
      deadline: row.deadline,
    }));

    res.json({ surveys });
  } catch (err) {
    console.error('[Delivery] pending error:', err);
    res.status(500).json({ error: 'Failed to get pending surveys' });
  }
});

export default router;
