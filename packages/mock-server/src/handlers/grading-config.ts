/**
 * MSW handler cho domain GradingConfig — `getActiveGradingConfig`,
 * `listGradingConfigVersions`, `saveGradingConfig`.
 *
 * Endpoint tương ứng:
 *   - GET  /api/grading-config/active -> getActiveGradingConfig()
 *   - GET  /api/grading-config        -> listGradingConfigVersions()
 *   - POST /api/grading-config        -> saveGradingConfig(input)
 */
import { http, HttpResponse } from 'msw';
import type { GradingConfig, GradingMode } from '@quick-grading/shared-types';
import { DomainError, ValidationError } from '@quick-grading/shared-types';
import { getDb, saveDb } from '../db.js';

function errorResponse(error: DomainError) {
  return HttpResponse.json(
    { code: error.code, message: error.message },
    { status: error.httpStatus },
  );
}

const VALID_MODES: GradingMode[] = ['RUBRIC', 'PROMPT', 'HYBRID'];

function validateGradingConfigInput(
  mode: unknown,
  rawPrompt: unknown,
): {
  validMode: GradingMode;
  systemPrompt?: string;
} {
  if (typeof mode !== 'string' || !VALID_MODES.includes(mode as GradingMode)) {
    throw new ValidationError(`mode phải là một trong: ${VALID_MODES.join(', ')}.`, 'mode');
  }
  const validMode = mode as GradingMode;

  const isPromptMode = validMode === 'PROMPT' || validMode === 'HYBRID';
  const hasPrompt = typeof rawPrompt === 'string' && rawPrompt.trim().length > 0;

  if (isPromptMode && !hasPrompt) {
    throw new ValidationError(
      `systemPrompt là bắt buộc khi chế độ chấm là ${validMode}.`,
      'systemPrompt',
    );
  }

  let systemPrompt: string | undefined;
  if (typeof rawPrompt === 'string') {
    if (rawPrompt.length > 8000) {
      throw new ValidationError('systemPrompt không được vượt quá 8.000 ký tự.', 'systemPrompt');
    }
    systemPrompt = rawPrompt;
  }

  return { validMode, systemPrompt };
}

export const gradingConfigHandlers = [
  // GET /api/grading-config/active
  http.get('*/api/grading-config/active', () => {
    const db = getDb();
    const active = db.gradingConfigs.find((c) => c.isActive) ?? null;
    return HttpResponse.json(active, { status: 200 });
  }),

  // GET /api/grading-config
  http.get('*/api/grading-config', () => {
    const db = getDb();
    const sorted = [...db.gradingConfigs].sort((a, b) => a.version - b.version);
    return HttpResponse.json(sorted, { status: 200 });
  }),

  // POST /api/grading-config
  http.post('*/api/grading-config', async ({ request }) => {
    try {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      const { validMode, systemPrompt } = validateGradingConfigInput(body.mode, body.systemPrompt);

      const db = getDb();
      const maxVersion = db.gradingConfigs.reduce((max, c) => Math.max(max, c.version), 0);
      const newVersion = maxVersion + 1;
      const now = new Date().toISOString();

      // Deactivate all existing
      for (const config of db.gradingConfigs) {
        config.isActive = false;
      }

      const newConfig: GradingConfig = {
        configId: 'default',
        version: newVersion,
        mode: validMode,
        systemPrompt,
        model:
          typeof body.model === 'string' && body.model.trim().length > 0
            ? body.model.trim()
            : undefined,
        reasoningEffort:
          body.reasoningEffort === 'low' || body.reasoningEffort === 'medium'
            ? body.reasoningEffort
            : undefined,
        maxInputTokens:
          typeof body.maxInputTokens === 'number' && body.maxInputTokens > 0
            ? body.maxInputTokens
            : 50000,
        maxOutputTokens:
          typeof body.maxOutputTokens === 'number' && body.maxOutputTokens > 0
            ? body.maxOutputTokens
            : 2000,
        autoGradeOnSubmit: Boolean(body.autoGradeOnSubmit),
        isActive: true,
        createdAt: now,
        createdBy: 'admin',
      };

      db.gradingConfigs.push(newConfig);
      saveDb();

      return HttpResponse.json(newConfig, { status: 201 });
    } catch (err: unknown) {
      if (err instanceof DomainError) {
        return errorResponse(err);
      }
      return HttpResponse.json({ code: 'INTERNAL_ERROR', message: 'Lỗi server.' }, { status: 500 });
    }
  }),
];
