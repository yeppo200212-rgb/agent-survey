import { Survey } from '../quality/scorer';

export interface Agent {
  id: string;
  name: string;
  is_ai_panel: boolean;
}

// AI Panel — stub for MVP
// Activate when ANTHROPIC_API_KEY is available
export async function generatePanelResponse(survey: Survey, agent: Agent): Promise<null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[AI Panel] ANTHROPIC_API_KEY not set — panel disabled in MVP');
    return null;
  }
  // TODO: implement when API key available
  // This would call the Claude API to generate a response for the panel agent
  // and submit it via the normal response pipeline
  return null;
}
