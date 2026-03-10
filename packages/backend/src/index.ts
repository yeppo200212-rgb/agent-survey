import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import agentsRouter from './api/agents';
import surveysRouter from './api/surveys';
import deliveryRouter from './api/delivery';
import responsesRouter from './api/responses';
import rewardsRouter from './api/rewards';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (lightweight)
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/agents', agentsRouter);
app.use('/api/surveys', surveysRouter);
app.use('/api/surveys', deliveryRouter);  // delivery: /:id/deliver and /pending
app.use('/api/responses', responsesRouter);
app.use('/api/rewards', rewardsRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err.stack || err.message);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[AgentMind] Server running on http://localhost:${PORT}`);
  console.log(`[AgentMind] Health: http://localhost:${PORT}/health`);

  if (!process.env.DATABASE_URL) {
    console.warn('[AgentMind] WARNING: DATABASE_URL not set — DB operations will fail');
  }
  if (!process.env.ADMIN_KEY) {
    console.warn('[AgentMind] WARNING: ADMIN_KEY not set — admin endpoints are unprotected');
  }
  if (!process.env.PLATFORM_HMAC_SECRET) {
    console.warn('[AgentMind] WARNING: PLATFORM_HMAC_SECRET not set — delivery signatures disabled');
  }
});

export default app;
