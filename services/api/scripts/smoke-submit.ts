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
  return output.OutputValue.replace(/\/+$/, '');
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

  return fetch(presigned.url, {
    method: 'POST',
    body: formData,
  });
}

export async function runSmokeTest(apiUrl: string): Promise<boolean> {
  console.log(`[smoke-submit] Bắt đầu smoke test với API: ${apiUrl}`);
  let allPassed = true;

  function report(pass: boolean, name: string, detail: string) {
    if (pass) {
      console.log(`PASS ${name} (${detail})`);
    } else {
      console.error(`FAIL ${name} (${detail})`);
      allPassed = false;
    }
  }

  // 1. GET /api/assignments includes OPEN and CLOSED
  try {
    const res = await fetch(`${apiUrl}/api/assignments`);
    if (!res.ok) {
      report(false, 'Case 1: GET /api/assignments', `HTTP ${res.status}`);
    } else {
      const data = (await res.json()) as Array<{ assignmentId: string; status: string }>;
      const hasOpen = data.some(
        (a) => a.assignmentId === ASSIGNMENT_OPEN_ID && a.status === 'OPEN',
      );
      const hasClosed = data.some(
        (a) => a.assignmentId === ASSIGNMENT_CLOSED_ID && a.status === 'CLOSED',
      );
      if (hasOpen && hasClosed) {
        report(true, 'Case 1: GET /api/assignments', `HTTP ${res.status}, tìm thấy cả 2 đợt`);
      } else {
        report(false, 'Case 1: GET /api/assignments', 'Không tìm thấy đủ 2 đợt đã seed');
      }
    }
  } catch (err) {
    report(false, 'Case 1: GET /api/assignments', err instanceof Error ? err.message : String(err));
  }

  // 2. New team Smoke <ULID> into OPEN: create -> 201; 2 presigned POST uploads -> 2xx; finalize -> 201
  const smokeUlid = ulid();
  const smokeTeamName = `Smoke ${smokeUlid}`;
  let createdSubmissionId = '';

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
      report(false, 'Case 2: Nộp bài mới', `Tạo submission thất bại với HTTP ${createRes.status}`);
    } else {
      const createData = (await createRes.json()) as CreateResponse;
      createdSubmissionId = createData.submissionId;

      // Upload MD
      const uploadMdRes = await uploadToPresignedPost(
        createData.uploads.md,
        mdContent,
        'report.md',
      );
      // Upload XML
      const uploadXmlRes = await uploadToPresignedPost(
        createData.uploads.xml,
        xmlContent,
        'data.xml',
      );

      if (!uploadMdRes.ok || !uploadXmlRes.ok) {
        report(
          false,
          'Case 2: Nộp bài mới',
          `Upload S3 thất bại: md HTTP ${uploadMdRes.status}, xml HTTP ${uploadXmlRes.status}`,
        );
      } else {
        // Finalize
        const finalizeRes = await fetch(
          `${apiUrl}/api/submissions/${encodeURIComponent(createdSubmissionId)}/finalize`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
        );

        if (finalizeRes.status !== 201) {
          report(false, 'Case 2: Nộp bài mới', `Finalize thất bại với HTTP ${finalizeRes.status}`);
        } else {
          const finalData = (await finalizeRes.json()) as FinalizeResponse;
          const statusOk = finalData.team?.status === 'SUBMITTED';
          const filesOk = Array.isArray(finalData.files) && finalData.files.length === 2;
          if (statusOk && filesOk) {
            report(
              true,
              'Case 2: Nộp bài mới',
              `HTTP 201, teamId=${finalData.team.teamId}, sid=${createdSubmissionId}`,
            );
          } else {
            report(false, 'Case 2: Nộp bài mới', 'Dữ liệu finalize không đúng trạng thái kỳ vọng');
          }
        }
      }
    }
  } catch (err) {
    report(false, 'Case 2: Nộp bài mới', err instanceof Error ? err.message : String(err));
  }

  // 3. Same name again: create -> 409 TEAM_NAME_CONFLICT
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
      report(true, 'Case 3: Trùng tên nhóm', `HTTP 409, code: ${dupBody.code}`);
    } else {
      report(
        false,
        'Case 3: Trùng tên nhóm',
        `Kỳ vọng 409 TEAM_NAME_CONFLICT, nhận HTTP ${dupRes.status}`,
      );
    }
  } catch (err) {
    report(false, 'Case 3: Trùng tên nhóm', err instanceof Error ? err.message : String(err));
  }

  // 4. Into CLOSED assignment: create -> 409 ASSIGNMENT_CLOSED
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
      report(true, 'Case 4: Nộp vào đợt đã đóng', `HTTP 409, code: ${closedBody.code}`);
    } else {
      report(
        false,
        'Case 4: Nộp vào đợt đã đóng',
        `Kỳ vọng 409 ASSIGNMENT_CLOSED, nhận HTTP ${closedRes.status}`,
      );
    }
  } catch (err) {
    report(false, 'Case 4: Nộp vào đợt đã đóng', err instanceof Error ? err.message : String(err));
  }

  // 5. Declared size 6 MB: create -> 400 VALIDATION_ERROR
  try {
    const oversizeDeclaredPayload = {
      assignmentId: ASSIGNMENT_OPEN_ID,
      teamName: `Smoke Oversize ${ulid()}`,
      members: [{ memberName: 'Sinh Viên 4', email: 'sv4@example.com' }],
      files: {
        md: { fileName: 'report.md', size: 6 * 1024 * 1024 },
        xml: { fileName: 'data.xml', size: 100 },
      },
    };

    const oversizeRes = await fetch(`${apiUrl}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(oversizeDeclaredPayload),
    });

    const oversizeBody = (await oversizeRes.json().catch(() => ({}))) as { code?: string };
    if (oversizeRes.status === 400 && oversizeBody.code === 'VALIDATION_ERROR') {
      report(
        true,
        'Case 5: Khai báo kích thước file vượt 5MB',
        `HTTP 400, code: ${oversizeBody.code}`,
      );
    } else {
      report(
        false,
        'Case 5: Khai báo kích thước file vượt 5MB',
        `Kỳ vọng 400 VALIDATION_ERROR, nhận HTTP ${oversizeRes.status}`,
      );
    }
  } catch (err) {
    report(
      false,
      'Case 5: Khai báo kích thước file vượt 5MB',
      err instanceof Error ? err.message : String(err),
    );
  }

  // 6. Declared 5 MB but upload 6 MB blob to presigned POST -> S3 rejects (non-2xx, EntityTooLarge)
  try {
    const validDeclaredPayload = {
      assignmentId: ASSIGNMENT_OPEN_ID,
      teamName: `Smoke S3Reject ${ulid()}`,
      members: [{ memberName: 'Sinh Viên 5', email: 'sv5@example.com' }],
      files: {
        md: { fileName: 'report.md', size: 5 * 1024 * 1024 },
        xml: { fileName: 'data.xml', size: 100 },
      },
    };

    const validCreateRes = await fetch(`${apiUrl}/api/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validDeclaredPayload),
    });

    if (validCreateRes.status !== 201) {
      report(
        false,
        'Case 6: S3 từ chối file > 5MB',
        `Tạo submission thất bại với HTTP ${validCreateRes.status}`,
      );
    } else {
      const validCreateData = (await validCreateRes.json()) as CreateResponse;
      // Tạo buffer 6MB thực tế
      const oversizeBuffer = Buffer.alloc(6 * 1024 * 1024, 0x20); // 6MB space characters
      const oversizeBlob = new Blob([oversizeBuffer], { type: 'text/markdown' });

      const s3Res = await uploadToPresignedPost(
        validCreateData.uploads.md,
        oversizeBlob,
        'report.md',
      );

      // S3 Policy condition content-length-range phải từ chối (HTTP 400)
      if (!s3Res.ok) {
        report(true, 'Case 6: S3 từ chối file > 5MB', `HTTP ${s3Res.status} từ S3`);
      } else {
        report(false, 'Case 6: S3 từ chối file > 5MB', 'S3 không từ chối file 6MB');
      }
      // Không gọi finalize theo đúng kế hoạch
    }
  } catch (err) {
    report(
      false,
      'Case 6: S3 từ chối file > 5MB',
      err instanceof Error ? err.message : String(err),
    );
  }

  return allPassed;
}

// Chạy trực tiếp khi file được gọi
const isDirectRun =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
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
