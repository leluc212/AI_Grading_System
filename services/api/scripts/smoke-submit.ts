/**
 * Smoke test E2E kiểm thử tự động toàn diện các route public đối với stack dev (`QuickGrading-dev`).
 *
 * Lưu ý: Mỗi lần chạy thành công script này sẽ để lại đúng 1 nhóm `Smoke <ULID>`
 * ở trạng thái `SUBMITTED` trong bảng DynamoDB `QuickGrading-dev` (được thiết kế có chủ đích).
 */
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { ulid } from 'ulid';

process.env.AWS_PROFILE ??= 'quick-grading';
process.env.AWS_REGION ??= 'ap-southeast-1';

const ASSIGNMENT_OPEN_ID = 'a1111111-1111-4111-8111-111111111111';
const ASSIGNMENT_CLOSED_ID = 'a2222222-2222-4222-8222-222222222222';

export async function readApiUrlFromStack(stackName: string): Promise<string> {
  const cfn = new CloudFormationClient({ region: process.env.AWS_REGION });
  const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = res.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${stackName} không tồn tại.`);
  }
  const output = stack.Outputs?.find((o) => o.OutputKey === 'ApiUrl');
  if (!output?.OutputValue) {
    throw new Error(`Output ApiUrl không tìm thấy trong stack ${stackName}.`);
  }
  let cleanVal = output.OutputValue;
  while (cleanVal.endsWith('/')) {
    cleanVal = cleanVal.slice(0, -1);
  }
  return cleanVal;
}

interface PresignedPostData {
  url: string;
  fields: Record<string, string>;
}

interface CreateResponse {
  submissionId: string;
  uploads: {
    md: PresignedPostData;
    xml: PresignedPostData;
  };
  expiresAt: string;
}

interface FinalizeResponse {
  team: {
    teamId: string;
    teamName: string;
    status: string;
  };
  files: Array<{ fileType: string; fileName: string; isLatest: boolean }>;
  resubmitted: boolean;
}

async function uploadToPresignedPost(
  presigned: PresignedPostData,
  fileContent: string | Blob,
  fileName: string,
): Promise<Response> {
  const formData = new FormData();
  for (const [k, v] of Object.entries(presigned.fields)) {
    formData.append(k, v);
  }
  const blob = typeof fileContent === 'string' ? new Blob([fileContent]) : fileContent;
  formData.append('file', blob, fileName);

  const targetUrl = new URL(presigned.url);
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    throw new Error(`Chỉ hỗ trợ giao thức HTTP/HTTPS: ${targetUrl.protocol}`);
  }

  return await fetch(targetUrl.toString(), {
    method: 'POST',
    body: formData,
  });
}

interface SmokeReporter {
  pass(name: string, detail: string): void;
  fail(name: string, detail: string): void;
}

async function testAssignments(apiUrl: string, report: SmokeReporter): Promise<void> {
  try {
    const res = await fetch(`${apiUrl}/api/assignments`);
    if (!res.ok) {
      report.fail('Case 1: GET /api/assignments', `HTTP ${res.status}`);
      return;
    }
    const data = (await res.json()) as Array<{ assignmentId: string; status: string }>;
    const hasOpen = data.some((a) => a.assignmentId === ASSIGNMENT_OPEN_ID && a.status === 'OPEN');
    const hasClosed = data.some(
      (a) => a.assignmentId === ASSIGNMENT_CLOSED_ID && a.status === 'CLOSED',
    );
    if (hasOpen && hasClosed) {
      report.pass('Case 1: GET /api/assignments', `HTTP ${res.status}, tìm thấy cả 2 đợt`);
    } else {
      report.fail('Case 1: GET /api/assignments', 'Không tìm thấy đủ 2 đợt đã seed');
    }
  } catch (err) {
    report.fail('Case 1: GET /api/assignments', err instanceof Error ? err.message : String(err));
  }
}

async function testNewSubmission(
  apiUrl: string,
  report: SmokeReporter,
  smokeTeamName: string,
): Promise<void> {
  try {
    const mdContent = '# Báo cáo đồ án\nNội dung báo cáo mẫu kiểm thử.';
    const xmlContent = '<?xml version="1.0" encoding="UTF-8"?><data><item>test</item></data>';

    const createPayload = {
      assignmentId: ASSIGNMENT_OPEN_ID,
      teamName: smokeTeamName,
      members: [
        {
          memberName: 'Sinh Viên Kiểm Thử',
          email: 'smoke.test@example.com',
          studentCode: 'SV99999',
        },
      ],
      files: {
        md: { fileName: 'report.md', size: Buffer.byteLength(mdContent, 'utf-8') },
        xml: { fileName: 'data.xml', size: Buffer.byteLength(xmlContent, 'utf-8') },
      },
    };

    const createRes = await fetch(`${apiUrl}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createPayload),
    });

    if (createRes.status !== 201) {
      report.fail('Case 2: Nộp bài mới', `Tạo submission thất bại với HTTP ${createRes.status}`);
      return;
    }

    const createData = (await createRes.json()) as CreateResponse;
    const uploadMdRes = await uploadToPresignedPost(createData.uploads.md, mdContent, 'report.md');
    const uploadXmlRes = await uploadToPresignedPost(
      createData.uploads.xml,
      xmlContent,
      'data.xml',
    );

    if (!uploadMdRes.ok || !uploadXmlRes.ok) {
      report.fail(
        'Case 2: Nộp bài mới',
        `Upload S3 thất bại: md HTTP ${uploadMdRes.status}, xml HTTP ${uploadXmlRes.status}`,
      );
      return;
    }

    const finalizeUrl = new URL(
      `${apiUrl}/api/submissions/${encodeURIComponent(createData.submissionId)}/finalize`,
    );
    if (finalizeUrl.protocol !== 'http:' && finalizeUrl.protocol !== 'https:') {
      throw new Error(`Chỉ hỗ trợ giao thức HTTP/HTTPS: ${finalizeUrl.protocol}`);
    }
    const finalizeRes = await fetch(finalizeUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (finalizeRes.status !== 201) {
      report.fail('Case 2: Nộp bài mới', `Finalize thất bại với HTTP ${finalizeRes.status}`);
      return;
    }

    const finalData = (await finalizeRes.json()) as FinalizeResponse;
    const statusOk = finalData.team?.status === 'SUBMITTED';
    const filesOk = Array.isArray(finalData.files) && finalData.files.length === 2;
    if (statusOk && filesOk) {
      report.pass(
        'Case 2: Nộp bài mới',
        `HTTP 201, teamId=${finalData.team.teamId}, sid=${createData.submissionId}`,
      );
    } else {
      report.fail('Case 2: Nộp bài mới', 'Dữ liệu finalize không đúng trạng thái kỳ vọng');
    }
  } catch (err) {
    report.fail('Case 2: Nộp bài mới', err instanceof Error ? err.message : String(err));
  }
}

async function testDuplicateTeamName(
  apiUrl: string,
  report: SmokeReporter,
  smokeTeamName: string,
): Promise<void> {
  try {
    const dupPayload = {
      assignmentId: ASSIGNMENT_OPEN_ID,
      teamName: smokeTeamName,
      members: [{ memberName: 'Sinh Viên 2', email: 'sv2@example.com' }],
      files: {
        md: { fileName: 'report.md', size: 100 },
        xml: { fileName: 'data.xml', size: 100 },
      },
    };

    const dupRes = await fetch(`${apiUrl}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dupPayload),
    });

    const dupBody = (await dupRes.json().catch(() => ({}))) as { code?: string };
    if (dupRes.status === 409 && dupBody.code === 'TEAM_NAME_CONFLICT') {
      report.pass('Case 3: Trùng tên nhóm', `HTTP 409, code: ${dupBody.code}`);
    } else {
      report.fail(
        'Case 3: Trùng tên nhóm',
        `Kỳ vọng 409 TEAM_NAME_CONFLICT, nhận HTTP ${dupRes.status}`,
      );
    }
  } catch (err) {
    report.fail('Case 3: Trùng tên nhóm', err instanceof Error ? err.message : String(err));
  }
}

async function testClosedAssignment(apiUrl: string, report: SmokeReporter): Promise<void> {
  try {
    const closedPayload = {
      assignmentId: ASSIGNMENT_CLOSED_ID,
      teamName: `Smoke Closed ${ulid()}`,
      members: [{ memberName: 'Sinh Viên 3', email: 'sv3@example.com' }],
      files: {
        md: { fileName: 'report.md', size: 100 },
        xml: { fileName: 'data.xml', size: 100 },
      },
    };

    const closedRes = await fetch(`${apiUrl}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(closedPayload),
    });

    const closedBody = (await closedRes.json().catch(() => ({}))) as { code?: string };
    if (closedRes.status === 409 && closedBody.code === 'ASSIGNMENT_CLOSED') {
      report.pass('Case 4: Nộp vào đợt đã đóng', `HTTP 409, code: ${closedBody.code}`);
    } else {
      report.fail(
        'Case 4: Nộp vào đợt đã đóng',
        `Kỳ vọng 409 ASSIGNMENT_CLOSED, nhận HTTP ${closedRes.status}`,
      );
    }
  } catch (err) {
    report.fail('Case 4: Nộp vào đợt đã đóng', err instanceof Error ? err.message : String(err));
  }
}

async function testOversizeDeclared(apiUrl: string, report: SmokeReporter): Promise<void> {
  try {
    const oversizePayload = {
      assignmentId: ASSIGNMENT_OPEN_ID,
      teamName: `Smoke Oversize ${ulid()}`,
      members: [{ memberName: 'Sinh Viên 4', email: 'sv4@example.com' }],
      files: {
        md: { fileName: 'report.md', size: 6 * 1024 * 1024 },
        xml: { fileName: 'data.xml', size: 100 },
      },
    };

    const res = await fetch(`${apiUrl}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(oversizePayload),
    });

    const body = (await res.json().catch(() => ({}))) as { code?: string };
    if (res.status === 400 && body.code === 'VALIDATION_ERROR') {
      report.pass('Case 5: Khai báo kích thước file vượt 5MB', `HTTP 400, code: ${body.code}`);
    } else {
      report.fail(
        'Case 5: Khai báo kích thước file vượt 5MB',
        `Kỳ vọng 400 VALIDATION_ERROR, nhận HTTP ${res.status}`,
      );
    }
  } catch (err) {
    report.fail(
      'Case 5: Khai báo kích thước file vượt 5MB',
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function testOversizeS3Upload(apiUrl: string, report: SmokeReporter): Promise<void> {
  try {
    const payload = {
      assignmentId: ASSIGNMENT_OPEN_ID,
      teamName: `Smoke S3Reject ${ulid()}`,
      members: [{ memberName: 'Sinh Viên 5', email: 'sv5@example.com' }],
      files: {
        md: { fileName: 'report.md', size: 5 * 1024 * 1024 },
        xml: { fileName: 'data.xml', size: 100 },
      },
    };

    const createRes = await fetch(`${apiUrl}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (createRes.status !== 201) {
      report.fail(
        'Case 6: S3 từ chối file > 5MB',
        `Tạo submission thất bại với HTTP ${createRes.status}`,
      );
      return;
    }

    const createData = (await createRes.json()) as CreateResponse;
    const oversizeBuffer = Buffer.alloc(6 * 1024 * 1024, 0x20);
    const oversizeBlob = new Blob([oversizeBuffer], { type: 'text/markdown' });

    const s3Res = await uploadToPresignedPost(createData.uploads.md, oversizeBlob, 'report.md');

    if (!s3Res.ok) {
      report.pass('Case 6: S3 từ chối file > 5MB', `HTTP ${s3Res.status} từ S3`);
    } else {
      report.fail('Case 6: S3 từ chối file > 5MB', 'S3 không từ chối file 6MB');
    }
  } catch (err) {
    report.fail('Case 6: S3 từ chối file > 5MB', err instanceof Error ? err.message : String(err));
  }
}

export async function runSmokeTest(apiUrl: string): Promise<boolean> {
  console.log(`[smoke-submit] Bắt đầu smoke test với API: ${apiUrl}`);
  let allPassed = true;

  const report: SmokeReporter = {
    pass(name: string, detail: string) {
      const cleanName = name.replace(/[\r\n]/g, '');
      const cleanDetail = detail.replace(/[\r\n]/g, '');
      console.log(`PASS ${cleanName} (${cleanDetail})`);
    },
    fail(name: string, detail: string) {
      const cleanName = name.replace(/[\r\n]/g, '');
      const cleanDetail = detail.replace(/[\r\n]/g, '');
      console.error(`FAIL ${cleanName} (${cleanDetail})`);
      allPassed = false;
    },
  };

  const smokeTeamName = `Smoke ${ulid()}`;

  await testAssignments(apiUrl, report);
  await testNewSubmission(apiUrl, report, smokeTeamName);
  await testDuplicateTeamName(apiUrl, report, smokeTeamName);
  await testClosedAssignment(apiUrl, report);
  await testOversizeDeclared(apiUrl, report);
  await testOversizeS3Upload(apiUrl, report);

  return allPassed;
}

// Chạy trực tiếp khi file được gọi
const isDirectRun =
  import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/')}` ||
  process.argv[1]?.endsWith('smoke-submit.ts');

if (isDirectRun) {
  const stackName = process.env.QG_STACK_NAME ?? 'QuickGrading-dev';
  try {
    const apiUrl = await readApiUrlFromStack(stackName);
    const passed = await runSmokeTest(apiUrl);
    if (!passed) {
      console.error('[smoke-submit] Kết quả: CÓ TEST CASE THẤT BẠI.');
      process.exit(1);
    }
    console.log('[smoke-submit] Kết quả: TẤT CẢ TEST CASES ĐỀU PASS.');
  } catch (err) {
    console.error('[smoke-submit] Lỗi thực thi:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
