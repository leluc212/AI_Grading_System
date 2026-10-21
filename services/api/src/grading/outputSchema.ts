/**
 * JSON Schema strict cho Structured Outputs của OpenAI.
 *
 * Tham khảo: docs/infra-plan.md mục 6.3.
 */
export const GRADING_OUTPUT_SCHEMA = {
  name: 'grading_result',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'criteria',
      'totalScore',
      'feedback',
      'needsReview',
      'needsReviewReason',
      'confidence',
    ],
    properties: {
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['criterionId', 'score', 'comment'],
          properties: {
            criterionId: { type: 'string' },
            score: { type: 'number' },
            comment: { type: 'string' },
          },
        },
      },
      totalScore: { type: 'number' },
      feedback: { type: 'string' },
      needsReview: { type: 'boolean' },
      needsReviewReason: { type: 'string' },
      confidence: { type: 'number' },
    },
  },
} as const;

export interface RawAiCriterionOutput {
  criterionId: string;
  score: number;
  comment: string;
}

export interface RawAiGradingOutput {
  criteria: RawAiCriterionOutput[];
  totalScore: number;
  feedback: string;
  needsReview: boolean;
  needsReviewReason: string;
  confidence: number;
}
