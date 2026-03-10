import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import { query } from '../db/client';
import { agentAuth, adminAuth } from '../middleware/auth';
import { scoreResponse, SurveyResponse, Survey, Agent, AnswerEntry } from '../quality/scorer';
import { normalizeBehavioralSignals } from '../behavioral/collector';
import { createHash } from 'crypto';

const router = Router();

const SURVEY_DOMAIN = {
  name: 'AgentMind',
  version: '1',
  chainId: 8453, // Base
};

const RESPONSE_TYPES = {
  SurveyResponse: [
    { name: 'surveyId', type: 'string' },
    { name: 'agentId', type: 'string' },
    { name: 'answersHash', type: 'bytes32' },
    { name: 'submittedAt', type: 'uint256' },
  ],
};

// POST /submit (agent auth)
router.post('/submit', agentAuth, async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const agentId = req.agent!.id;
  const { surveyId, answers, walletSignature, behavioralHints } = req.body;

  if (!surveyId || !answers) {
    res.status(400).json({ error: 'surveyId and answers are required' });
    return;
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    res.status(400).json({ error: 'answers must be a non-empty array' });
    return;
  }

  for (const a of answers as AnswerEntry[]) {
    if (!a.questionId || a.value === undefined || !a.reasoning) {
      res.status(400).json({
        error: 'Each answer must have questionId, value, and reasoning',
      });
      return;
    }
    if (typeof a.confidence !== 'number' || a.confidence < 0 || a.confidence > 1) {
      res.status(400).json({
        error: `Answer ${a.questionId}: confidence must be a number between 0 and 1`,
      });
      return;
    }
  }

  try {
    // Validate survey exists and is active
    const surveyResult = await query<{ id: string; status: string; deadline: string | null }>(
      'SELECT id, status, deadline FROM surveys WHERE id = $1',
      [surveyId]
    );

    if (surveyResult.rows.length === 0) {
      res.status(404).json({ error: 'Survey not found' });
      return;
    }

    const survey = surveyResult.rows[0];
    if (survey.status !== 'active') {
      res.status(400).json({ error: `Survey is not active. Current status: ${survey.status}` });
      return;
    }

    if (survey.deadline && new Date(survey.deadline) < new Date()) {
      res.status(400).json({ error: 'Survey deadline has passed' });
      return;
    }

    // Check for duplicate response
    const dupCheck = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM survey_responses WHERE survey_id = $1 AND agent_id = $2',
      [surveyId, agentId]
    );

    if (parseInt(dupCheck.rows[0].count, 10) > 0) {
      res.status(409).json({ error: 'Agent has already responded to this survey' });
      return;
    }

    // Verify EIP-712 signature if provided
    if (walletSignature) {
      try {
        const answersHash = createHash('sha256').update(JSON.stringify(answers)).digest('hex');
        const answersHashBytes32 = '0x' + answersHash.substring(0, 64);
        const submittedAt = Math.floor(Date.now() / 1000);

        const typedData = {
          surveyId,
          agentId,
          answersHash: answersHashBytes32,
          submittedAt,
        };

        const recovered = ethers.verifyTypedData(SURVEY_DOMAIN, RESPONSE_TYPES, typedData, walletSignature);
        console.log(`[Responses] EIP-712 signature verified. Recovered address: ${recovered}`);
      } catch (sigErr) {
        console.warn('[Responses] Invalid wallet signature:', sigErr);
        res.status(400).json({ error: 'Invalid wallet signature' });
        return;
      }
    }

    // Normalize behavioral signals
    const signals = normalizeBehavioralSignals(behavioralHints || {});
    const processingMs = signals.processingMs ?? (Date.now() - startTime);

    // Save response
    const result = await query<{ id: string; status: string }>(
      `INSERT INTO survey_responses
         (survey_id, agent_id, answers, wallet_signature, processing_ms, behavioral_signals, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, status`,
      [
        surveyId,
        agentId,
        JSON.stringify(answers),
        walletSignature || null,
        processingMs,
        JSON.stringify(signals),
      ]
    );

    res.status(201).json({
      responseId: result.rows[0].id,
      surveyId,
      status: result.rows[0].status,
      message: 'Response submitted. Scoring will run after deadline.',
    });
  } catch (err) {
    console.error('[Responses] submit error:', err);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

// POST /:surveyId/score (admin only)
router.post('/:surveyId/score', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { surveyId } = req.params;

  try {
    // Get survey
    const surveyResult = await query<Survey & { reward_base: number }>(
      'SELECT id, questions, reward_base FROM surveys WHERE id = $1',
      [surveyId]
    );

    if (surveyResult.rows.length === 0) {
      res.status(404).json({ error: 'Survey not found' });
      return;
    }

    const survey = surveyResult.rows[0];

    // Get all pending responses for this survey
    const responsesResult = await query<SurveyResponse>(
      `SELECT sr.id, sr.survey_id, sr.agent_id, sr.answers, sr.processing_ms, sr.quality_score
       FROM survey_responses sr
       WHERE sr.survey_id = $1 AND sr.status = 'pending'`,
      [surveyId]
    );

    const allResponses = responsesResult.rows;

    if (allResponses.length === 0) {
      res.json({ surveyId, scored: 0, results: [], message: 'No pending responses to score' });
      return;
    }

    // Get all agents for these responses
    const agentIds = [...new Set(allResponses.map((r) => r.agent_id))];
    const agentsResult = await query<Agent>(
      'SELECT id, quality_score FROM agents WHERE id = ANY($1)',
      [agentIds]
    );
    const agentMap = new Map(agentsResult.rows.map((a) => [a.id, a]));

    const results = [];

    for (const response of allResponses) {
      const agent = agentMap.get(response.agent_id) || {
        id: response.agent_id,
        quality_score: 50,
      };

      const scoreResult = await scoreResponse({
        response,
        survey,
        agent,
        allResponsesForSurvey: allResponses,
      });

      const rewardAmount =
        Math.round(Number(survey.reward_base) * (scoreResult.total / 100) * 100) / 100;

      await query(
        `UPDATE survey_responses
         SET quality_score = $1, quality_breakdown = $2, reward_amount = $3, status = 'scored'
         WHERE id = $4`,
        [scoreResult.total, JSON.stringify(scoreResult.breakdown), rewardAmount, response.id]
      );

      // Update agent's rolling quality score (exponential moving average)
      const currentScore = Number(agent.quality_score) || 50;
      const newScore = Math.round((currentScore * 0.8 + scoreResult.total * 0.2) * 100) / 100;
      await query('UPDATE agents SET quality_score = $1 WHERE id = $2', [newScore, agent.id]);

      results.push({
        responseId: response.id,
        agentId: response.agent_id,
        qualityScore: scoreResult.total,
        breakdown: scoreResult.breakdown,
        rewardAmount,
      });
    }

    res.json({ surveyId, scored: results.length, results });
  } catch (err) {
    console.error('[Responses] score error:', err);
    res.status(500).json({ error: 'Failed to score responses' });
  }
});

// GET /:surveyId (admin only)
router.get('/:surveyId', adminAuth, async (req: Request, res: Response): Promise<void> => {
  const { surveyId } = req.params;

  try {
    const result = await query(
      `SELECT sr.id, sr.agent_id, a.name as agent_name, sr.answers,
              sr.quality_score, sr.quality_breakdown, sr.reward_amount,
              sr.processing_ms, sr.behavioral_signals, sr.wallet_signature,
              sr.status, sr.submitted_at
       FROM survey_responses sr
       JOIN agents a ON sr.agent_id = a.id
       WHERE sr.survey_id = $1
       ORDER BY sr.submitted_at DESC`,
      [surveyId]
    );

    res.json({
      surveyId,
      responses: result.rows,
      total: result.rows.length,
    });
  } catch (err) {
    console.error('[Responses] get error:', err);
    res.status(500).json({ error: 'Failed to get responses' });
  }
});

export default router;
