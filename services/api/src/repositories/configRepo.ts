/**
 * Repository đọc cấu hình Rubric và GradingConfig từ DynamoDB (infra-plan mục 4.1, 6.1).
 *
 * Cache trong bộ nhớ theo version để tối ưu cold/warm start cho worker.
 */
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { Rubric, RubricCriterion, GradingConfig } from '@quick-grading/shared-types';
import { getDdbDocClient } from './ddb.js';
import { readEnv } from '../lib/env.js';
import {
  rubricActiveKey,
  rubricVersionKey,
  gradingConfigActiveKey,
  gradingConfigVersionKey,
} from '../domain/gradingKeys.js';

const rubricCache = new Map<number, Rubric>();
const configCache = new Map<number, GradingConfig>();

export function _resetConfigRepoCacheForTesting(): void {
  rubricCache.clear();
  configCache.clear();
}

/**
 * Lấy Rubric đang active.
 */
export async function getActiveRubric(): Promise<Rubric | undefined> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  // 1. Đọc version active
  const activeRes = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: rubricActiveKey(),
    }),
  );

  const activeVersion = activeRes?.Item?.version as number | undefined;
  if (!activeVersion) {
    return undefined;
  }

  // 2. Kiểm tra cache
  if (rubricCache.has(activeVersion)) {
    return rubricCache.get(activeVersion);
  }

  // 3. Đọc bản ghi version
  const versionRes = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: rubricVersionKey(activeVersion),
    }),
  );

  const rubric = versionRes?.Item?.rubric as Rubric | undefined;
  if (rubric) {
    rubricCache.set(activeVersion, rubric);
  }
  return rubric;
}

/**
 * Lấy GradingConfig đang active.
 */
export async function getActiveGradingConfig(): Promise<GradingConfig | undefined> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  // 1. Đọc version active
  const activeRes = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: gradingConfigActiveKey(),
    }),
  );

  const activeVersion = activeRes?.Item?.version as number | undefined;
  if (!activeVersion) {
    return undefined;
  }

  // 2. Kiểm tra cache
  if (configCache.has(activeVersion)) {
    return configCache.get(activeVersion);
  }

  // 3. Đọc bản ghi version
  const versionRes = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: gradingConfigVersionKey(activeVersion),
    }),
  );

  const config = versionRes?.Item?.config as GradingConfig | undefined;
  if (config) {
    configCache.set(activeVersion, config);
  }
  return config;
}

/**
 * Lưu Rubric phiên bản mới và kích hoạt active (dùng cho seed và admin API).
 */
export async function saveRubricVersion(rubric: Rubric): Promise<void> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: {
              ...rubricVersionKey(rubric.version),
              rubric,
              createdAt: rubric.createdAt,
            },
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...rubricActiveKey(),
              version: rubric.version,
              updatedAt: new Date().toISOString(),
            },
          },
        },
      ],
    }),
  );

  rubricCache.set(rubric.version, rubric);
}

/**
 * Lưu GradingConfig phiên bản mới và kích hoạt active (dùng cho seed và admin API).
 */
export async function saveGradingConfigVersion(config: GradingConfig): Promise<void> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: {
              ...gradingConfigVersionKey(config.version),
              config,
              createdAt: config.createdAt,
            },
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...gradingConfigActiveKey(),
              version: config.version,
              updatedAt: new Date().toISOString(),
            },
          },
        },
      ],
    }),
  );

  configCache.set(config.version, config);
}

/**
 * Liệt kê toàn bộ phiên bản Rubric, sắp xếp tăng dần theo version.
 */
export async function listRubricVersions(): Promise<Rubric[]> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': 'RUBRIC#default',
        ':prefix': 'V#',
      },
    }),
  );

  const rubrics: Rubric[] = (res.Items ?? [])
    .map((item) => item.rubric as Rubric)
    .filter(Boolean);

  return rubrics.sort((a, b) => a.version - b.version);
}

/**
 * Tạo và kích hoạt phiên bản Rubric mới.
 */
export async function createRubricVersion(criteria: RubricCriterion[]): Promise<Rubric> {
  const versions = await listRubricVersions();
  const maxVersion = versions.reduce((max, r) => Math.max(max, r.version), 0);
  const now = new Date().toISOString();

  const newRubric: Rubric = {
    rubricId: crypto.randomUUID(),
    version: maxVersion + 1,
    criteria,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await saveRubricVersion(newRubric);
  return newRubric;
}

/**
 * Liệt kê toàn bộ phiên bản GradingConfig, sắp xếp tăng dần theo version.
 */
export async function listGradingConfigVersions(): Promise<GradingConfig[]> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': 'GRADINGCONFIG#default',
        ':prefix': 'V#',
      },
    }),
  );

  const configs: GradingConfig[] = (res.Items ?? [])
    .map((item) => item.config as GradingConfig)
    .filter(Boolean);

  return configs.sort((a, b) => a.version - b.version);
}

/**
 * Tạo và kích hoạt phiên bản GradingConfig mới.
 */
export async function createGradingConfigVersion(
  params: Omit<GradingConfig, 'configId' | 'version' | 'isActive' | 'createdAt'>,
): Promise<GradingConfig> {
  const versions = await listGradingConfigVersions();
  const maxVersion = versions.reduce((max, c) => Math.max(max, c.version), 0);
  const now = new Date().toISOString();

  const newConfig: GradingConfig = {
    ...params,
    configId: 'default',
    version: maxVersion + 1,
    isActive: true,
    createdAt: now,
  };

  await saveGradingConfigVersion(newConfig);
  return newConfig;
}
