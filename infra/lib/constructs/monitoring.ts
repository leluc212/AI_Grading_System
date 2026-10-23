/**
 * Cảnh báo (infra-plan mục 3): SNS topic + 1 email subscription cho mỗi địa
 * chỉ trong context `alarmEmails`, alarm 5xx của HTTP API, Budget tháng gửi
 * mail ở 50/80/100% (cùng danh sách email).
 *
 * Budget tính trên toàn account (lọc theo cost-allocation tag cần bật tay
 * trong Billing).
 */
import { Duration } from 'aws-cdk-lib';
import type * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import type { StackConfig } from '../config.js';

/** AWS Budgets cho phép tối đa 10 subscriber email / notification. */
export const MAX_BUDGET_SUBSCRIBERS = 10;
export const BUDGET_THRESHOLDS = [50, 80, 100];

export class Monitoring extends Construct {
  readonly topic: sns.Topic;

  constructor(scope: Construct, id: string, props: { config: StackConfig; api: apigwv2.HttpApi }) {
    super(scope, id);
    const { config, api } = props;

    if (config.alarmEmails.length > MAX_BUDGET_SUBSCRIBERS) {
      throw new Error(
        `alarmEmails has ${config.alarmEmails.length} addresses; AWS Budgets allows at most ${MAX_BUDGET_SUBSCRIBERS}.`,
      );
    }

    this.topic = new sns.Topic(this, 'AlarmTopic', {
      // NOSONAR typescript:S6327 - SNS topic uses default encryption; email alert topics should not use KMS
      topicName: `QuickGrading-${config.stage}-alarms`,
      displayName: `QuickGrading ${config.stage} alarms`,
    });
    for (const email of config.alarmEmails) {
      this.topic.addSubscription(new subscriptions.EmailSubscription(email));
    }

    const api5xx = new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5xx',
      dimensionsMap: { ApiId: api.apiId, Stage: '$default' },
      statistic: cloudwatch.Stats.SUM,
      period: Duration.minutes(5),
    });
    const alarm = new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      alarmName: `QuickGrading-${config.stage}-api-5xx`,
      alarmDescription: 'HTTP API trả lỗi 5xx (xem log Lambda public-api theo requestId).',
      metric: api5xx,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new cwActions.SnsAction(this.topic));

    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `QuickGrading-${config.stage}-monthly`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: config.budgetLimitUsd, unit: 'USD' },
      },
      notificationsWithSubscribers: BUDGET_THRESHOLDS.map((threshold) => ({
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: config.alarmEmails.map((address) => ({
          subscriptionType: 'EMAIL',
          address,
        })),
      })),
    });
  }
}
