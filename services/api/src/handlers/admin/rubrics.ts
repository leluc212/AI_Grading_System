/**
 * Handler các route quản lý Rubric của Admin (infra-plan mục 3.2, 6.1).
 *
 * - GET  /api/rubrics/active
 * - GET  /api/rubrics
 * - POST /api/rubrics
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { RubricCriterion } from '@quick-grading/shared-types';
import { ValidationError } from '@quick-grading/shared-types';
import { jsonResponse } from '../../lib/http.js';
import { parseJsonBody } from '../../lib/router.js';
import {
  createRubricVersion,
  getActiveRubric,
  listRubricVersions,
} from '../../repositories/configRepo.js';

function validateCriteria(raw: unknown): RubricCriterion[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError('criteria phải là một mảng không rỗng.', 'criteria');
  }

  return raw.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new ValidationError(`criteria[${index}] không hợp lệ.`, 'criteria');
    }
    const { id, label, description, weight } = item as Record<string, unknown>;

    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new ValidationError(`criteria[${index}].id là bắt buộc (string).`, 'criteria');
    }
    if (typeof label !== 'string' || label.trim().length === 0) {
      throw new ValidationError(
        `criteria[${index}].label là bắt buộc (string, không rỗng).`,
        'criteria',
      );
    }
    if (
      weight !== undefined &&
      (typeof weight !== 'number' || Number.isNaN(weight) || weight < 0)
    ) {
      throw new ValidationError(
        `criteria[${index}].weight phải là số không âm nếu có.`,
        'criteria',
      );
    }
    if (description !== undefined && typeof description !== 'string') {
      throw new ValidationError(
        `criteria[${index}].description phải là string nếu có.`,
        'criteria',
      );
    }

    const criterion: RubricCriterion = {
      id: id.trim(),
      label: label.trim(),
    };
    if (description !== undefined) {
      criterion.description = description.trim();
    }
    if (weight !== undefined) {
      criterion.weight = weight;
    }
    return criterion;
  });
}

export async function handleGetActiveRubric(): Promise<APIGatewayProxyStructuredResultV2> {
  const rubric = await getActiveRubric();
  return jsonResponse(200, rubric ?? null);
}

export async function handleListRubricVersions(): Promise<APIGatewayProxyStructuredResultV2> {
  const rubrics = await listRubricVersions();
  return jsonResponse(200, rubrics);
}

export async function handleCreateRubric(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const body = parseJsonBody(event) as Record<string, unknown> | undefined;
  const rawCriteria = body?.criteria;

  const criteria = validateCriteria(rawCriteria);
  const rubric = await createRubricVersion(criteria);

  return jsonResponse(201, rubric);
}
