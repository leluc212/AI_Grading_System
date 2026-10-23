/**
 * Handler các route quản lý GradingConfig của Admin (infra-plan mục 3.2, 6.1).
 *
 * - GET  /api/grading-config/active
 * - GET  /api/grading-config
 * - POST /api/grading-config
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { GradingMode } from '@quick-grading/shared-types';
import { ValidationError } from '@quick-grading/shared-types';
import { jsonResponse } from '../../lib/http.js';
import { parseJsonBody } from '../../lib/router.js';
import {
  createGradingConfigVersion,
  getActiveGradingConfig,
  listGradingConfigVersions,
} from '../../repositories/configRepo.js';

const VALID_MODES: GradingMode[] = ['RUBRIC', 'PROMPT', 'HYBRID'];

export async function handleGetActiveGradingConfig(): Promise<APIGatewayProxyStructuredResultV2> {
  const config = await getActiveGradingConfig();
  return jsonResponse(200, config ?? null);
}

export async function handleListGradingConfigVersions(): Promise<APIGatewayProxyStructuredResultV2> {
  const configs = await listGradingConfigVersions();
  return jsonResponse(200, configs);
}

function parseMode(body?: Record<string, unknown>): GradingMode {
  const mode = body?.mode as GradingMode | undefined;
  if (!mode || !VALID_MODES.includes(mode)) {
    throw new ValidationError(
      `mode phải là 1 trong các giá trị: ${VALID_MODES.join(', ')}.`,
      'mode',
    );
  }
  return mode;
}

function parseSystemPrompt(rawPrompt: unknown, mode: GradingMode): string | undefined {
  if (
    (mode === 'PROMPT' || mode === 'HYBRID') &&
    (typeof rawPrompt !== 'string' || rawPrompt.trim().length === 0)
  ) {
    throw new ValidationError(
      `systemPrompt là bắt buộc khi chế độ chấm là ${mode}.`,
      'systemPrompt',
    );
  }

  if (typeof rawPrompt === 'string') {
    if (rawPrompt.length > 8000) {
      throw new ValidationError('systemPrompt không được vượt quá 8.000 ký tự.', 'systemPrompt');
    }
    return rawPrompt;
  }

  return undefined;
}

function parseReasoningEffort(effort: unknown): 'low' | 'medium' | undefined {
  if (effort === undefined) {
    return undefined;
  }
  if (effort !== 'low' && effort !== 'medium') {
    throw new ValidationError("reasoningEffort phải là 'low' hoặc 'medium'.", 'reasoningEffort');
  }
  return effort;
}

export async function handleCreateGradingConfig(
  event: APIGatewayProxyEventV2,
  username: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const body = parseJsonBody(event) as Record<string, unknown> | undefined;

  const mode = parseMode(body);
  const systemPrompt = parseSystemPrompt(body?.systemPrompt, mode);
  const reasoningEffort = parseReasoningEffort(body?.reasoningEffort);

  const model =
    typeof body?.model === 'string' && body.model.trim().length > 0 ? body.model.trim() : undefined;

  const maxInputTokens =
    typeof body?.maxInputTokens === 'number' && body.maxInputTokens > 0
      ? body.maxInputTokens
      : 50000;

  const maxOutputTokens =
    typeof body?.maxOutputTokens === 'number' && body.maxOutputTokens > 0
      ? body.maxOutputTokens
      : 2000;

  const autoGradeOnSubmit =
    typeof body?.autoGradeOnSubmit === 'boolean' ? body.autoGradeOnSubmit : false;

  const newConfig = await createGradingConfigVersion({
    mode,
    systemPrompt,
    model,
    reasoningEffort,
    maxInputTokens,
    maxOutputTokens,
    autoGradeOnSubmit,
    createdBy: username,
  });

  return jsonResponse(201, newConfig);
}
