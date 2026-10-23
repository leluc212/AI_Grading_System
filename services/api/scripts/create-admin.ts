/**
 * Script tạo tài khoản Quản trị viên / Giảng viên trong AWS Cognito User Pool (infra-plan mục 3.1).
 *
 * Cách dùng:
 *   npx tsx scripts/create-admin.ts --username admin --email swat.lucle@gmail.com [--password <matkhau>]
 */
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

process.env.AWS_PROFILE ??= 'quick-grading';
process.env.AWS_REGION ??= 'ap-southeast-1';
process.env.STAGE ??= 'dev';

async function readUserPoolIdFromStack(stackName: string): Promise<string> {
  const cfn = new CloudFormationClient({ region: process.env.AWS_REGION });
  const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = res.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${stackName} không tồn tại.`);
  }
  const output = stack.Outputs?.find((o) => o.OutputKey === 'UserPoolId');
  if (!output?.OutputValue) {
    throw new Error(`Output UserPoolId không tìm thấy trong stack ${stackName}.`);
  }
  return output.OutputValue;
}

export async function run() {
  const args = process.argv.slice(2);

  const getArg = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
  };

  const username = getArg('--username') ?? 'admin';
  const email = getArg('--email') ?? 'swat.lucle@gmail.com';
  const password = getArg('--password') ?? 'Admin@123456';

  const stackName = `QuickGrading-${process.env.STAGE}`;
  const userPoolId = process.env.USER_POOL_ID || (await readUserPoolIdFromStack(stackName));

  console.log(`[create-admin] Sử dụng User Pool ID: ${userPoolId}`);
  console.log(`[create-admin] Đang tạo tài khoản Quản trị viên: ${username} (${email})...`);

  const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      }),
    );
    console.log(`[create-admin] Đã tạo thành công tài khoản ${username} trong Cognito.`);
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    if (name === 'UsernameExistsException') {
      console.log(`[create-admin] Tài khoản ${username} đã tồn tại, tiến hành cập nhật mật khẩu.`);
    } else {
      throw err;
    }
  }

  // Đặt mật khẩu vĩnh viễn (không yêu cầu đổi ở lần đăng nhập đầu)
  await cognito.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: username,
      Password: password,
      Permanent: true,
    }),
  );

  console.log(`[create-admin] Đã đặt mật khẩu vĩnh viễn cho tài khoản ${username} thành công!`);
  console.log('===== THÔNG TIN ĐĂNG NHẬP ADMIN =====');
  console.log(`Username: ${username}`);
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log('====================================');
}

if (process.argv[1]?.endsWith('create-admin.ts')) {
  try {
    await run();
  } catch (err) {
    console.error('[create-admin] Thất bại:', err);
    process.exit(1);
  }
}
