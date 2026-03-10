import axios, { AxiosInstance } from 'axios';
import { createHmac } from 'crypto';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import { signResponse } from './signer';

export interface SurveyQuestion {
  id: string;
  type: 'multiple_choice' | 'likert' | 'open';
  text: string;
  options?: string[];
}

export interface Survey {
  surveyId: string;
  title: string;
  questions: SurveyQuestion[];
  rewardEstimate: number;
  deadline: string;
}

export interface AnswerInput {
  questionId: string;
  value: string | number | string[];
  reasoning: string;
  confidence: number; // 0-1
}

export interface AgentSurveyRespondentConfig {
  platformUrl: string;           // e.g. https://api.agentmind.xyz
  agentId: string;
  apiKey: string;
  walletPrivateKey?: string;     // optional EIP-712 signing
  onSurvey: (survey: Survey) => Promise<AnswerInput[]>;
  mode?: 'push' | 'pull';       // default: pull
  pollIntervalMs?: number;       // default: 30000
  pushPort?: number;             // default: 3001
  platformHmacSecret?: string;   // for push mode signature verification
}

export class AgentSurveyRespondent {
  private config: Required<Omit<AgentSurveyRespondentConfig, 'walletPrivateKey' | 'platformHmacSecret'>> &
    Pick<AgentSurveyRespondentConfig, 'walletPrivateKey' | 'platformHmacSecret'>;
  private http: AxiosInstance;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pushServer: Server | null = null;
  private activeSurveys = new Set<string>(); // prevent concurrent processing of same survey
  private running = false;

  constructor(config: AgentSurveyRespondentConfig) {
    this.config = {
      mode: 'pull',
      pollIntervalMs: 30000,
      pushPort: 3001,
      ...config,
    } as Required<Omit<AgentSurveyRespondentConfig, 'walletPrivateKey' | 'platformHmacSecret'>> &
      Pick<AgentSurveyRespondentConfig, 'walletPrivateKey' | 'platformHmacSecret'>;

    this.http = axios.create({
      baseURL: config.platformUrl,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      console.log('[SDK] Already running');
      return;
    }
    this.running = true;

    console.log(`[SDK] Starting in ${this.config.mode} mode for agent ${this.config.agentId}`);

    if (this.config.mode === 'push') {
      this.startPushMode();
    } else {
      this.startPullMode();
    }
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      console.log('[SDK] Pull mode stopped');
    }

    if (this.pushServer) {
      await new Promise<void>((resolve, reject) => {
        this.pushServer!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      this.pushServer = null;
      console.log('[SDK] Push mode server stopped');
    }
  }

  private startPullMode(): void {
    console.log(`[SDK] Pull mode: polling every ${this.config.pollIntervalMs}ms`);

    const poll = async () => {
      if (!this.running) return;
      try {
        const response = await this.http.get<{ surveys: Survey[] }>('/api/surveys/pending');
        const surveys = response.data.surveys || [];

        if (surveys.length > 0) {
          console.log(`[SDK] Found ${surveys.length} pending survey(s)`);
        }

        // Process surveys sequentially to avoid overwhelming the agent
        for (const survey of surveys) {
          if (!this.activeSurveys.has(survey.surveyId)) {
            await this.processSurvey(survey);
          }
        }
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          console.error(`[SDK] Poll error: ${err.response?.status} ${err.message}`);
        } else {
          console.error('[SDK] Poll error:', err);
        }
      }
    };

    // Run immediately, then on interval
    poll();
    this.pollTimer = setInterval(poll, this.config.pollIntervalMs);
  }

  private startPushMode(): void {
    const app = express();
    app.use(express.json({ limit: '1mb' }));

    app.post('/survey/deliver', async (req: Request, res: Response) => {
      // Verify HMAC signature if secret configured
      if (this.config.platformHmacSecret) {
        const signature = req.headers['x-platform-signature'] as string;
        if (!signature) {
          res.status(401).json({ error: 'Missing X-Platform-Signature header' });
          return;
        }

        const expectedSig = createHmac('sha256', this.config.platformHmacSecret)
          .update(JSON.stringify(req.body))
          .digest('hex');

        if (signature !== expectedSig) {
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }

      const payload = req.body;
      if (!payload.surveyId || !payload.questions) {
        res.status(400).json({ error: 'Invalid survey payload' });
        return;
      }

      const survey: Survey = {
        surveyId: payload.surveyId,
        title: payload.title || 'Survey',
        questions: payload.questions,
        rewardEstimate: payload.rewardEstimate || 0,
        deadline: payload.deadline || '',
      };

      // Acknowledge immediately; process async
      res.json({ received: true, surveyId: survey.surveyId });

      // Process in background
      if (!this.activeSurveys.has(survey.surveyId)) {
        this.processSurvey(survey).catch((err) => {
          console.error(`[SDK] Error processing pushed survey ${survey.surveyId}:`, err);
        });
      } else {
        console.log(`[SDK] Survey ${survey.surveyId} already being processed — skipping`);
      }
    });

    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', agentId: this.config.agentId, mode: 'push' });
    });

    this.pushServer = app.listen(this.config.pushPort, () => {
      console.log(`[SDK] Push mode: listening on port ${this.config.pushPort}`);
    });
  }

  private async processSurvey(survey: Survey): Promise<void> {
    if (this.activeSurveys.has(survey.surveyId)) {
      return;
    }
    this.activeSurveys.add(survey.surveyId);

    const startTime = Date.now();
    console.log(`[SDK] Processing survey: ${survey.surveyId} "${survey.title}"`);

    try {
      const answers = await this.config.onSurvey(survey);
      const processingMs = Date.now() - startTime;

      if (!answers || answers.length === 0) {
        console.warn(`[SDK] onSurvey returned no answers for survey ${survey.surveyId}`);
        return;
      }

      await this.submitResponse(survey.surveyId, answers, processingMs);
    } catch (err) {
      console.error(`[SDK] Error in onSurvey for survey ${survey.surveyId}:`, err);
    } finally {
      this.activeSurveys.delete(survey.surveyId);
    }
  }

  private async submitResponse(
    surveyId: string,
    answers: AnswerInput[],
    processingMs: number
  ): Promise<void> {
    let walletSignature: string | undefined;

    if (this.config.walletPrivateKey) {
      try {
        walletSignature = await signResponse({
          surveyId,
          agentId: this.config.agentId,
          answers,
          privateKey: this.config.walletPrivateKey,
        });
      } catch (sigErr) {
        console.warn('[SDK] Failed to sign response:', sigErr);
        // Continue without signature
      }
    }

    const now = new Date().toISOString();
    const submittedAt = now;
    const acceptedAt = new Date(Date.now() - processingMs).toISOString();

    const payload = {
      surveyId,
      answers,
      walletSignature,
      behavioralHints: {
        processingMs,
        acceptedAt,
        submittedAt,
        retryCount: 0,
      },
    };

    try {
      const response = await this.http.post('/api/responses/submit', payload);
      console.log(
        `[SDK] Response submitted for survey ${surveyId}. Response ID: ${response.data.responseId}`
      );
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const body = err.response?.data;

        if (status === 409) {
          console.log(`[SDK] Already responded to survey ${surveyId} — skipping`);
          return;
        }

        console.error(`[SDK] Submit failed for survey ${surveyId}: ${status}`, body);
        throw err;
      }
      throw err;
    }
  }
}

export { signResponse, verifySignature } from './signer';
