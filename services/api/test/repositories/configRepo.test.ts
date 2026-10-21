import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Rubric, GradingConfig } from '@quick-grading/shared-types';
import {
  getActiveRubric,
  getActiveGradingConfig,
  saveRubricVersion,
  saveGradingConfigVersion,
  _resetConfigRepoCacheForTesting,
} from '../../src/repositories/configRepo.js';

describe('configRepo', () => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    ddbMock.reset();
    _resetConfigRepoCacheForTesting();
    process.env.TABLE_NAME = 'QuickGrading-dev';
    process.env.STAGE = 'dev';
    process.env.BUCKET_NAME = 'quick-grading-dev-test';
  });

  it('lấy active rubric và cache cho các lần đọc tiếp theo', async () => {
    const fakeRubric: Rubric = {
      rubricId: 'default',
      version: 1,
      isActive: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      criteria: [{ id: 'c1', label: 'Tiêu chí 1', weight: 100 }],
    };

    ddbMock
      .on(GetCommand, {
        Key: { PK: 'RUBRIC#default', SK: 'ACTIVE' },
      })
      .resolves({ Item: { version: 1 } });

    ddbMock
      .on(GetCommand, {
        Key: { PK: 'RUBRIC#default', SK: 'V#1' },
      })
      .resolves({ Item: { rubric: fakeRubric } });

    const r1 = await getActiveRubric();
    expect(r1).toEqual(fakeRubric);
    expect(ddbMock.calls()).toHaveLength(2);

    // Lần 2 đọc từ cache
    const r2 = await getActiveRubric();
    expect(r2).toEqual(fakeRubric);
    expect(ddbMock.calls()).toHaveLength(3); // Chỉ đọc GetCommand cho ACTIVE
  });

  it('lấy active gradingConfig và cache cho các lần đọc tiếp theo', async () => {
    const fakeConfig: GradingConfig = {
      configId: 'default',
      version: 1,
      mode: 'RUBRIC',
      maxInputTokens: 50_000,
      maxOutputTokens: 2_000,
      autoGradeOnSubmit: false,
      isActive: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      createdBy: 'admin',
    };

    ddbMock
      .on(GetCommand, {
        Key: { PK: 'GRADINGCONFIG#default', SK: 'ACTIVE' },
      })
      .resolves({ Item: { version: 1 } });

    ddbMock
      .on(GetCommand, {
        Key: { PK: 'GRADINGCONFIG#default', SK: 'V#1' },
      })
      .resolves({ Item: { config: fakeConfig } });

    const c1 = await getActiveGradingConfig();
    expect(c1).toEqual(fakeConfig);
    expect(ddbMock.calls()).toHaveLength(2);

    const c2 = await getActiveGradingConfig();
    expect(c2).toEqual(fakeConfig);
    expect(ddbMock.calls()).toHaveLength(3);
  });

  it('lưu phiên bản rubric mới bằng TransactWriteCommand', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});

    const newRubric: Rubric = {
      rubricId: 'default',
      version: 2,
      isActive: true,
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
      criteria: [],
    };

    await saveRubricVersion(newRubric);
    expect(ddbMock.calls()).toHaveLength(1);
  });

  it('lưu phiên bản gradingConfig mới bằng TransactWriteCommand', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});

    const newConfig: GradingConfig = {
      configId: 'default',
      version: 2,
      mode: 'HYBRID',
      systemPrompt: 'Test',
      maxInputTokens: 50_000,
      maxOutputTokens: 2_000,
      autoGradeOnSubmit: false,
      isActive: true,
      createdAt: '2026-10-02T00:00:00.000Z',
      createdBy: 'admin',
    };

    await saveGradingConfigVersion(newConfig);
    expect(ddbMock.calls()).toHaveLength(1);
  });
});
