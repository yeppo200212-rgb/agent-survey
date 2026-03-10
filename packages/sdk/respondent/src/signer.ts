import { ethers } from 'ethers';
import { createHash } from 'crypto';

export const SURVEY_DOMAIN = {
  name: 'AgentMind',
  version: '1',
  chainId: 8453, // Base
};

export const RESPONSE_TYPES = {
  SurveyResponse: [
    { name: 'surveyId', type: 'string' },
    { name: 'agentId', type: 'string' },
    { name: 'answersHash', type: 'bytes32' },
    { name: 'submittedAt', type: 'uint256' },
  ],
};

/**
 * Signs a survey response with EIP-712.
 * Returns a hex signature string.
 */
export async function signResponse(params: {
  surveyId: string;
  agentId: string;
  answers: unknown[];
  privateKey: string;
}): Promise<string> {
  const { surveyId, agentId, answers, privateKey } = params;

  const wallet = new ethers.Wallet(privateKey);

  const answersHash = createHash('sha256').update(JSON.stringify(answers)).digest('hex');
  const answersHashBytes32 = '0x' + answersHash.substring(0, 64);
  const submittedAt = Math.floor(Date.now() / 1000);

  const typedData = {
    surveyId,
    agentId,
    answersHash: answersHashBytes32,
    submittedAt,
  };

  const signature = await wallet.signTypedData(SURVEY_DOMAIN, RESPONSE_TYPES, typedData);
  return signature;
}

/**
 * Verifies an EIP-712 signature and returns the recovered address.
 */
export async function verifySignature(params: {
  surveyId: string;
  agentId: string;
  answers: unknown[];
  signature: string;
  submittedAt?: number;
}): Promise<string> {
  const { surveyId, agentId, answers, signature } = params;

  const answersHash = createHash('sha256').update(JSON.stringify(answers)).digest('hex');
  const answersHashBytes32 = '0x' + answersHash.substring(0, 64);
  const submittedAt = params.submittedAt ?? Math.floor(Date.now() / 1000);

  const typedData = {
    surveyId,
    agentId,
    answersHash: answersHashBytes32,
    submittedAt,
  };

  const recoveredAddress = ethers.verifyTypedData(SURVEY_DOMAIN, RESPONSE_TYPES, typedData, signature);
  return recoveredAddress;
}
