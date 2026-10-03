/**
 * Trang form nộp bài.
 *
 * Gồm 2 phần tách biệt rõ:
 *
 * 1. **Cổng kiểm tra Assignment** (`SubmitFormPage`, task 5.2). Form CHỈ được
 *    render khi assignment tồn tại và đang `OPEN` (Requirement 1.7). Nếu đã
 *    `CLOSED` thì từ chối kèm thông báo và không render form (Requirement
 *    1.8) — chốt chặn cho trường hợp gõ tay URL hoặc dùng lại link cũ.
 *
 * 2. **Form nộp bài** (`TeamSubmissionForm`, task 5.5 + 5.6): tên nhóm +
 *    `MemberListEditor` + 2 `FileUploadField`, gọi
 *    `teamsApi.createTeamAndSubmit` và xử lý kết quả thành công/lỗi.
 *
 * Tách thành 2 component vì state của form (tên nhóm, thành viên, file, lỗi)
 * chỉ có nghĩa khi assignment đã xác định là `OPEN`. Gộp chung thì phải khởi
 * tạo cả đống state ngay lúc còn đang loading, và phải tự nhớ reset khi
 * `assignmentId` đổi.
 *
 * _Requirements: 1.7, 1.8, 2.1, 2.5, 2.9, 2.10, 2.11, 2.12_
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Assignment } from '@quick-grading/shared-types';
import {
  AssignmentClosedError,
  NotFoundError,
  TeamNameConflictError,
  ValidationError,
} from '@quick-grading/shared-types';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { FileUploadField } from '../components/FileUploadField';
import { MemberListEditor } from '../components/MemberListEditor';
import { assignmentsApi, teamsApi } from '../services';
import { toDisplayMessage } from '../errorMessage';
import type { SubmitSuccessState } from '../submitSuccessState';
import type { MemberDraft, SubmitFormErrors } from '../validation';
import {
  createEmptyMember,
  hasSubmitFormErrors,
  toApiMembers,
  validateSubmitForm,
} from '../validation';

/**
 * Kết quả của cổng kiểm tra assignment.
 *
 * `closed` là 1 nhánh riêng (không gộp vào `error`) vì đây là tình huống
 * nghiệp vụ bình thường cần câu thông báo riêng theo Requirement 1.8, trong
 * khi `error` là lỗi tải dữ liệu / không tìm thấy.
 */
type GateState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'closed'; assignment: Assignment }
  | { kind: 'open'; assignment: Assignment };

export function SubmitFormPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<GateState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;

    if (assignmentId === undefined || assignmentId.trim().length === 0) {
      // Thực tế route `/submit/:assignmentId` luôn có param, nhánh này chỉ
      // để type-safe và phòng khi bảng route đổi.
      setState({ kind: 'error', message: 'Thiếu mã đợt chấm trong đường dẫn.' });
      return;
    }

    setState({ kind: 'loading' });

    assignmentsApi
      .getAssignment(assignmentId)
      .then((assignment) => {
        if (cancelled) {
          return;
        }
        setState(
          assignment.status === 'OPEN'
            ? { kind: 'open', assignment }
            : { kind: 'closed', assignment },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        console.error('[SubmitFormPage] Không tải được thông tin đợt chấm:', error);
        setState({
          kind: 'error',
          // `NotFoundError` từ service layer đã có câu tiếng Việt sẵn
          // ("Không tìm thấy Assignment với id ..."), nên hiển thị nguyên văn.
          message: toDisplayMessage(error, 'Không tải được thông tin đợt chấm. Vui lòng thử lại.'),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  const goToAssignmentList = useCallback(() => {
    navigate('/');
  }, [navigate]);

  if (state.kind === 'loading') {
    return (
      <Container header={<Header variant="h2">Nộp bài</Header>}>
        <Box textAlign="center" padding="l">
          <SpaceBetween size="s" alignItems="center">
            <Spinner size="large" />
            <Box variant="p">Đang kiểm tra đợt chấm...</Box>
          </SpaceBetween>
        </Box>
      </Container>
    );
  }

  if (state.kind === 'error') {
    return (
      <Container header={<Header variant="h2">Nộp bài</Header>}>
        <Alert
          type="error"
          header="Không mở được form nộp bài"
          action={<Button onClick={goToAssignmentList}>Chọn đợt chấm khác</Button>}
        >
          {state.message}
        </Alert>
      </Container>
    );
  }

  if (state.kind === 'closed') {
    // Requirement 1.8 — từ chối và nói rõ lý do, KHÔNG render form.
    return (
      <Container header={<Header variant="h2">Nộp bài</Header>}>
        <Alert
          type="error"
          header="Đợt chấm đã đóng"
          action={<Button onClick={goToAssignmentList}>Chọn đợt chấm khác</Button>}
        >
          Đợt chấm &ldquo;{state.assignment.assignmentName}&rdquo; đã đóng, không thể nộp bài. Vui
          lòng liên hệ giảng viên nếu nhóm bạn cần nộp muộn.
        </Alert>
      </Container>
    );
  }

  // state.kind === 'open' — Requirement 1.7 đã thoả: có đúng 1 assignment
  // đang OPEN được xác định, giờ mới cho phép điền form.
  return (
    <Container
      header={
        <Header variant="h2" description={`Đợt chấm: ${state.assignment.assignmentName}`}>
          Nộp bài
        </Header>
      }
    >
      <TeamSubmissionForm
        assignment={state.assignment}
        onCancel={goToAssignmentList}
        onSubmitted={(successState) => {
          // `replace: true` để nút Back của trình duyệt không quay về form đã
          // nộp (nhóm bấm Back rồi bấm nộp lần nữa sẽ chỉ nhận lỗi trùng tên).
          navigate('/submit-success', { state: successState, replace: true });
        }}
      />
    </Container>
  );
}

/**
 * Trạng thái của lần gửi request hiện tại.
 *
 * `failed.blocking` đánh dấu loại lỗi mà thử lại ngay cũng vô ích (đợt chấm
 * đã đóng, đợt chấm không còn tồn tại). Khi đó nút nộp bị vô hiệu và thay vào
 * đó mời người dùng chọn đợt khác — tử tế hơn là để họ bấm nộp lại nhiều lần
 * và nhận đúng 1 lỗi.
 */
type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'failed'; header: string; message: string; blocking: boolean };

interface TeamSubmissionFormProps {
  assignment: Assignment;
  onCancel: () => void;
  onSubmitted: (successState: SubmitSuccessState) => void;
}

/** Lỗi rỗng ban đầu — chưa validate gì nên không ô nào bị đánh dấu. */
const NO_ERRORS: SubmitFormErrors = { members: {} };

function TeamSubmissionForm({ assignment, onCancel, onSubmitted }: TeamSubmissionFormProps) {
  const [teamName, setTeamName] = useState('');
  // Requirement 2.3: mở form là đã có sẵn 1 dòng thành viên để điền.
  const [members, setMembers] = useState<MemberDraft[]>(() => [createEmptyMember()]);
  const [mdFile, setMdFile] = useState<File | null>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<SubmitFormErrors>(NO_ERRORS);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });

  const submitting = submitState.kind === 'submitting';
  const blocked = submitState.kind === 'failed' && submitState.blocking;

  /**
   * Map lỗi từ lớp service sang thông báo cụ thể cho người nộp bài
   * (Requirement 2.10, 2.12).
   *
   * Phân loại theo `instanceof` typed error — đây chính là lý do `api-client`
   * map `{ code, message }` của server thành error class: UI quyết định cách
   * hiển thị dựa trên LOẠI lỗi, không phải so khớp chuỗi.
   */
  const describeSubmitError = useCallback((error: unknown): SubmitState => {
    if (error instanceof TeamNameConflictError) {
      // Requirement 2.12 — message của error đã đúng câu nghiệp vụ cần hiển
      // thị ("Nhóm ... đã nộp bài, vui lòng liên hệ Admin nếu cần nộp lại.").
      return {
        kind: 'failed',
        header: 'Tên nhóm đã được sử dụng',
        message: error.message,
        blocking: false,
      };
    }
    if (error instanceof AssignmentClosedError) {
      // Đợt chấm bị Admin đóng trong lúc nhóm đang điền form.
      return {
        kind: 'failed',
        header: 'Đợt chấm đã đóng',
        message: error.message,
        blocking: true,
      };
    }
    if (error instanceof NotFoundError) {
      return {
        kind: 'failed',
        header: 'Không tìm thấy đợt chấm',
        message: error.message,
        blocking: true,
      };
    }
    if (error instanceof ValidationError) {
      // Server validate lại và từ chối (Requirement 11.3). Hiển thị nguyên
      // văn câu của server — nó chỉ rõ thành viên/file nào sai.
      //
      // Ghi chú: body lỗi từ server chỉ có `{ code, message }` nên
      // `ValidationError.field` luôn `undefined` ở phía client (xem
      // `api-client/http.ts`). Vì vậy lỗi này hiện ở alert chung thay vì gắn
      // được vào đúng ô — client đã validate trước nên trường hợp này hiếm.
      return {
        kind: 'failed',
        header: 'Thông tin chưa hợp lệ',
        message: error.message,
        blocking: false,
      };
    }
    // Requirement 2.10: lỗi hệ thống -> thông báo rõ ràng, và tuyệt đối
    // KHÔNG điều hướng sang trang thành công.
    return {
      kind: 'failed',
      header: 'Không nộp được bài',
      message:
        'Đã xảy ra lỗi hệ thống khi ghi nhận bài nộp. Bài của nhóm CHƯA được ghi nhận, vui lòng thử lại.',
      blocking: false,
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    const draft = { teamName, members, mdFile, xmlFile };
    const nextErrors = validateSubmitForm(draft);
    setErrors(nextErrors);

    if (hasSubmitFormErrors(nextErrors)) {
      // Chặn tại client, chưa gọi API (Requirement 2.9: chỉ nộp khi đủ thông
      // tin hợp lệ).
      setSubmitState({
        kind: 'failed',
        header: 'Thông tin chưa hợp lệ',
        message: 'Vui lòng kiểm tra lại các ô được đánh dấu lỗi phía dưới.',
        blocking: false,
      });
      return;
    }

    if (draft.mdFile === null || draft.xmlFile === null) {
      // Không thể xảy ra: `validateSubmitForm` đã báo lỗi khi thiếu file.
      // Nhánh này tồn tại để thu hẹp kiểu cho TypeScript.
      return;
    }

    setSubmitState({ kind: 'submitting' });

    try {
      const result = await teamsApi.createTeamAndSubmit({
        assignmentId: assignment.assignmentId,
        teamName: teamName.trim(),
        members: toApiMembers(members),
        mdFile: draft.mdFile,
        xmlFile: draft.xmlFile,
      });

      // Requirement 2.9: chỉ tới đây — khi API trả OK — mới được coi là
      // thành công. Requirement 2.11: không gửi email gì cho Submitter.
      onSubmitted({
        teamName: result.team.teamName,
        assignmentName: assignment.assignmentName,
        fileNames: result.files.map((file) => file.fileName),
        // Server quyết định đây là nộp lần đầu hay nộp lại (nhóm đã được Admin
        // mở khoá) — client không tự suy đoán được vì không đọc được danh sách
        // nhóm của đợt chấm (Requirement 11.1).
        resubmitted: result.resubmitted,
      });
    } catch (error: unknown) {
      console.error('[TeamSubmissionForm] Nộp bài thất bại:', error);
      setSubmitState(describeSubmitError(error));
    }
  }, [assignment, describeSubmitError, mdFile, members, onSubmitted, teamName, xmlFile]);

  return (
    <form
      // `noValidate`: tắt constraint validation của trình duyệt. Nếu bật, 1 ô
      // không thoả ràng buộc HTML (type/required/pattern) sẽ khiến trình duyệt
      // CHẶN luôn sự kiện submit — `handleSubmit` không chạy và người dùng chỉ
      // thấy tooltip mặc định của trình duyệt thay vì thông báo Cloudscape của
      // ta (design.md > Error Handling). Toàn bộ validate do
      // `validateSubmitForm` đảm nhiệm, và server kiểm lại lần nữa.
      noValidate
      onSubmit={(event) => {
        // Chặn submit mặc định của trình duyệt (reload trang) — toàn bộ việc
        // gửi do `handleSubmit` đảm nhiệm.
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <Form
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onCancel} disabled={submitting}>
              Huỷ
            </Button>
            <Button variant="primary" formAction="submit" loading={submitting} disabled={blocked}>
              Nộp bài
            </Button>
          </SpaceBetween>
        }
      >
        <SpaceBetween size="l">
          {submitState.kind === 'failed' && (
            <Alert
              type="error"
              header={submitState.header}
              action={
                submitState.blocking ? (
                  <Button onClick={onCancel}>Chọn đợt chấm khác</Button>
                ) : undefined
              }
            >
              {submitState.message}
            </Alert>
          )}

          <FormField
            label="Tên nhóm"
            // Nói rõ cách nộp lại: đây là đường duy nhất để nhóm đã được Admin
            // mở khoá nộp bản mới (Requirement 2.14), và nếu không hướng dẫn
            // thì không ai đoán được.
            description="Tên nhóm phải khác các nhóm đã nộp trong cùng đợt chấm này. Nếu nhóm bạn đã được giảng viên mở khoá nộp lại, hãy nhập đúng tên nhóm cũ để nộp bản mới."
            errorText={errors.teamName}
          >
            <Input
              value={teamName}
              disabled={submitting}
              placeholder="Nhóm Rồng Vàng"
              ariaLabel="Tên nhóm"
              onChange={({ detail }) => setTeamName(detail.value)}
            />
          </FormField>

          {/*
            Requirement 2.5: form KHÔNG có field "tên trường". Đây là chủ ý,
            không phải bỏ sót — đừng thêm vào.
          */}

          <FormField
            label="Thành viên nhóm"
            description="Mỗi nhóm cần ít nhất 1 thành viên. Tên và email là bắt buộc, MSSV tuỳ chọn."
          >
            <MemberListEditor
              members={members}
              errors={errors.members}
              disabled={submitting}
              onChange={setMembers}
            />
          </FormField>

          <FileUploadField
            label="File bài làm (.md)"
            description="File markdown chứa phần trình bày của nhóm."
            extension=".md"
            value={mdFile}
            errorText={errors.mdFile}
            onChange={({ file, error }) => {
              setMdFile(file);
              setErrors((current) => ({ ...current, mdFile: error }));
            }}
          />

          <FileUploadField
            label="File bài làm (.xml)"
            description="File XML kèm theo bài làm của nhóm."
            extension=".xml"
            value={xmlFile}
            errorText={errors.xmlFile}
            onChange={({ file, error }) => {
              setXmlFile(file);
              setErrors((current) => ({ ...current, xmlFile: error }));
            }}
          />
        </SpaceBetween>
      </Form>
    </form>
  );
}
