/**
 * DynamoDB Document client dùng chung, tạo lười để test mock được
 * (`aws-sdk-client-mock` mock prototype nên mọi instance đều bị chặn).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { readEnv } from '../lib/env.js';

let client: DynamoDBDocumentClient | undefined;

export function ddb(): DynamoDBDocumentClient {
  if (client === undefined) {
    client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return client;
}

export const getDdbDocClient = ddb;

export function tableName(): string {
  return readEnv().tableName;
}
