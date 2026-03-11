import { createHash } from 'crypto';

export interface SurveyResponse {
  id: string;
  survey_id: string;
  agent_id: string;
  answers: AnswerEntry[];
  processing_ms: number | null;
  quality_score: number | null;
}

export interface AnswerEntry {
  questionId: string;
  value: string | number | string[];
  reasoning: string;
  confidence: number;
}

export interface Survey {
  id: string;
  questions: SurveyQuestion[];
  reward_base: number;
}

export interface SurveyQuestion {
  id: string;
  type: 'multiple_choice' | 'likert' | 'open';
  text: string;
  options?: string[] | null;
}

export interface Agent {
  id: string;
  quality_score: number;
}

export interface ScoreBreakdown {
  textAnalysis: number;   // 0-50
  speedPenalty: number;   // -10 or 0 (조작 탐지 전용)
  coherence: number;      // 0-25
  uniqueness: number;     // 0-20
  history: number;        // 0-15
}

export interface ScoreResult {
  total: number; // 0-100
  breakdown: ScoreBreakdown;
}

// --- Text Analysis (50pts) ---
function scoreTextAnalysis(answers: AnswerEntry[], questions: SurveyQuestion[]): number {
  let score = 0;

  // Reasoning length score (20pts)
  const totalReasoningChars = answers.reduce((acc, a) => acc + (a.reasoning?.length || 0), 0);
  if (totalReasoningChars >= 200) {
    score += 20;
  } else if (totalReasoningChars >= 100) {
    score += 11;
  } else if (totalReasoningChars >= 50) {
    score += 5;
  }

  // Keyword overlap between question text and reasoning (0-20pts)
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  let totalOverlapScore = 0;
  let answerCount = 0;

  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    if (!question || !answer.reasoning) continue;

    const questionWords = new Set(
      question.text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3)
    );
    const reasoningWords = new Set(
      answer.reasoning
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3)
    );

    const intersection = [...questionWords].filter((w) => reasoningWords.has(w));
    const overlapRatio = questionWords.size > 0 ? intersection.length / questionWords.size : 0;
    totalOverlapScore += Math.min(overlapRatio, 1);
    answerCount++;
  }

  if (answerCount > 0) {
    const avgOverlap = totalOverlapScore / answerCount;
    score += Math.round(avgOverlap * 20);
  }

  // Penalty for repetitive phrases (-10pts)
  const allReasoning = answers.map((a) => a.reasoning || '').join(' ');
  if (hasRepetitivePhrases(allReasoning)) {
    score = Math.max(0, score - 10);
  }

  return Math.min(50, Math.max(0, score));
}

function hasRepetitivePhrases(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/);
  const phraseCount = new Map<string, number>();

  for (let i = 0; i <= words.length - 5; i++) {
    const phrase = words.slice(i, i + 5).join(' ');
    phraseCount.set(phrase, (phraseCount.get(phrase) || 0) + 1);
    if ((phraseCount.get(phrase) || 0) >= 2) {
      return true;
    }
  }
  return false;
}

// --- Speed Penalty (-10 or 0) ---
// 에이전트 성능(하드웨어/모델 크기)은 처리 시간과 무관하므로 보상 기능 제거.
// 500ms 미만 응답만 조작 의심으로 페널티. 그 외 중립.
function scoreSpeedPenalty(processingMs: number | null): number {
  if (processingMs === null || processingMs === undefined) {
    return 0; // 알 수 없음 — 중립
  }
  if (processingMs < 500) {
    return -10; // 사전 생성 응답 의심
  }
  return 0;
}

// --- Coherence (20pts) ---
const NEGATIVE_WORDS = new Set([
  'not', 'no', 'never', 'bad', 'poor', 'wrong', 'unsafe', 'risky', 'dangerous',
  'fail', 'failure', 'problem', 'issue', 'concern', 'avoid', 'unlikely', 'disagree',
  'negative', 'against', 'reject', 'doubt', 'uncertain', 'weak', 'low', 'worse',
]);

const POSITIVE_WORDS = new Set([
  'yes', 'good', 'great', 'safe', 'secure', 'strong', 'positive', 'agree',
  'excellent', 'high', 'best', 'better', 'success', 'reliable', 'trustworthy',
  'confident', 'recommend', 'approve', 'support', 'effective', 'proven',
]);

function scoreCoherence(answers: AnswerEntry[], questions: SurveyQuestion[]): number {
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  let totalScore = 0;
  let scorableAnswers = 0;

  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    if (!question) continue;
    if (question.type !== 'multiple_choice' && question.type !== 'likert') continue;
    if (!answer.reasoning) continue;

    scorableAnswers++;
    const reasoning = answer.reasoning.toLowerCase();
    const reasoningWords = reasoning.split(/\W+/);

    const positiveCount = reasoningWords.filter((w) => POSITIVE_WORDS.has(w)).length;
    const negativeCount = reasoningWords.filter((w) => NEGATIVE_WORDS.has(w)).length;
    const reasoningPolarity = positiveCount - negativeCount; // positive = positive sentiment

    let valueNum: number | null = null;
    if (question.type === 'likert' && typeof answer.value === 'number') {
      valueNum = answer.value;
    } else if (question.type === 'likert' && typeof answer.value === 'string') {
      valueNum = parseFloat(answer.value);
    }

    if (valueNum !== null && !isNaN(valueNum)) {
      // Likert: 1-2 = negative, 4-5 = positive, 3 = neutral
      const valuePolarity = valueNum >= 4 ? 1 : valueNum <= 2 ? -1 : 0;
      const reasoningSign = reasoningPolarity > 0 ? 1 : reasoningPolarity < 0 ? -1 : 0;

      if (valuePolarity === 0 || reasoningSign === 0) {
        // Neutral — give partial credit
        totalScore += 0.5;
      } else if (valuePolarity === reasoningSign) {
        // Aligned — full credit
        totalScore += 1;
      }
      // Misaligned — 0 pts
    } else {
      // multiple_choice without numeric value — give partial credit
      totalScore += 0.5;
    }
  }

  if (scorableAnswers === 0) return 12; // No scorable answers — neutral

  const ratio = totalScore / scorableAnswers;
  return Math.round(ratio * 25);
}

// --- Uniqueness (20pts) ---
function scoreUniqueness(
  response: SurveyResponse,
  allResponsesForSurvey: SurveyResponse[]
): number {
  if (allResponsesForSurvey.length <= 1) return 20; // Only one response — fully unique

  const myHashes = new Set(
    response.answers.map((a) =>
      createHash('sha256').update(a.reasoning || '').digest('hex')
    )
  );

  // Collect all hashes from other responses
  const otherHashes = new Set<string>();
  for (const other of allResponsesForSurvey) {
    if (other.id === response.id) continue;
    for (const a of other.answers) {
      otherHashes.add(createHash('sha256').update(a.reasoning || '').digest('hex'));
    }
  }

  // Count how many of my hashes are unique
  let uniqueCount = 0;
  for (const hash of myHashes) {
    if (!otherHashes.has(hash)) {
      uniqueCount++;
    }
  }

  const ratio = myHashes.size > 0 ? uniqueCount / myHashes.size : 1;
  return Math.round(ratio * 20);
}

// --- History (15pts) ---
function scoreHistory(agent: Agent): number {
  const score = Math.max(0, Math.min(100, Number(agent.quality_score) || 50));
  return Math.round((score / 100) * 15 * 10) / 10; // round to 1 decimal
}

// --- Main scorer ---
export async function scoreResponse(params: {
  response: SurveyResponse;
  survey: Survey;
  agent: Agent;
  allResponsesForSurvey: SurveyResponse[];
}): Promise<ScoreResult> {
  const { response, survey, agent, allResponsesForSurvey } = params;

  const questions: SurveyQuestion[] = Array.isArray(survey.questions)
    ? (survey.questions as SurveyQuestion[])
    : [];

  const textAnalysis = scoreTextAnalysis(response.answers, questions);
  const speedPenalty = scoreSpeedPenalty(response.processing_ms);
  const coherence = scoreCoherence(response.answers, questions);
  const uniqueness = scoreUniqueness(response, allResponsesForSurvey);
  const history = scoreHistory(agent);

  const total = Math.min(100, Math.max(0, Math.round(textAnalysis + speedPenalty + coherence + uniqueness + history)));

  return {
    total,
    breakdown: {
      textAnalysis,
      speedPenalty,
      coherence,
      uniqueness,
      history,
    },
  };
}
