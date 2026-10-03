/**
 * Rubric domain types.
 *
 * See design.md > Data Models for the source-of-truth shape of these types.
 */

export interface RubricCriterion {
  id: string;
  label: string;
  weight?: number;
}

export interface Rubric {
  rubricId: string;
  version: number;
  criteria: RubricCriterion[];
  /** de trong, chot sau */
  reviewFlagRules?: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
