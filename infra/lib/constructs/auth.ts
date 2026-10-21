/**
 * Quản lý xác thực Quản trị viên / Giảng viên bằng AWS Cognito (infra-plan mục 3, 3.1).
 *
 * Cấu hình:
 * - User Pool: self-signup tắt (chỉ admin tạo tài khoản bằng CLI/script), đăng nhập bằng username hoặc email.
 * - User Pool Client: SPA client không secret, hỗ trợ luồng SRP và USER_PASSWORD cho Amplify.
 * - HttpJwtAuthorizer: xác thực JWT token cấp bởi Cognito trên HTTP API.
 */
import { RemovalPolicy } from 'aws-cdk-lib';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import type { StackConfig } from '../config.js';

export interface AuthProps {
  config: StackConfig;
}

export class Auth extends Construct {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly authorizer: HttpJwtAuthorizer;

  constructor(scope: Construct, id: string, props: AuthProps) {
    super(scope, id);
    const { config } = props;

    // 1. User Pool cho Quản trị viên / Giảng viên
    this.userPool = new cognito.UserPool(this, 'AdminUserPool', {
      userPoolName: `QuickGrading-${config.stage}-admins`,
      selfSignUpEnabled: false,
      signInAliases: {
        username: true,
        email: true,
      },
      autoVerify: { email: false },
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: false,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.NONE,
      removalPolicy: config.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // 2. User Pool Client cho Web Admin SPA
    this.userPoolClient = new cognito.UserPoolClient(this, 'AdminUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `QuickGrading-${config.stage}-admin-web`,
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      preventUserExistenceErrors: true,
    });

    // 3. HTTP JWT Authorizer cho API Gateway v2
    this.authorizer = new HttpJwtAuthorizer(
      'AdminJwtAuthorizer',
      this.userPool.userPoolProviderUrl,
      {
        jwtAudience: [this.userPoolClient.userPoolClientId],
      },
    );
  }
}
