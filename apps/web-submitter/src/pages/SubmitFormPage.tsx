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
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { useLanguage } from '../i18n/LanguageContext';
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
  const { t, language } = useLanguage();
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
      <div className="fcaj-form-card">
        <h2
          style={{
            margin: '0 0 16px',
            fontSize: '1.6rem',
            fontWeight: 800,
            color: 'var(--fcaj-text-primary)',
          }}
        >
          {t('submitFormTitle')}
        </h2>
        <Box textAlign="center" padding="xxl">
          <SpaceBetween size="m" alignItems="center">
            <Spinner size="large" />
            <Box variant="h3">{t('checkingAssignment')}</Box>
          </SpaceBetween>
        </Box>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="fcaj-form-card">
        <h2
          style={{
            margin: '0 0 16px',
            fontSize: '1.6rem',
            fontWeight: 800,
            color: 'var(--fcaj-text-primary)',
          }}
        >
          {t('submitFormTitle')}
        </h2>
        <Alert
          type="error"
          header={language === 'vi' ? 'Không mở được form nộp bài' : 'Unable to open submission form'}
          action={<Button onClick={goToAssignmentList}>{t('btnChooseOther')}</Button>}
        >
          {state.message}
        </Alert>
      </div>
    );
  }

  if (state.kind === 'closed') {
    // Requirement 1.8 — từ chối và nói rõ lý do, KHÔNG render form.
    return (
      <div className="fcaj-form-card">
        <h2
          style={{
            margin: '0 0 16px',
            fontSize: '1.6rem',
            fontWeight: 800,
            color: 'var(--fcaj-text-primary)',
          }}
        >
          {t('submitFormTitle')}
        </h2>
        <Alert
          type="error"
          header={t('assignmentClosedHeader')}
          action={<Button onClick={goToAssignmentList}>{t('btnChooseOther')}</Button>}
        >
          {language === 'vi' ? (
            <>
              Đợt chấm &ldquo;{state.assignment.assignmentName}&rdquo; đã đóng, không thể nộp bài. Vui
              lòng liên hệ giảng viên nếu nhóm bạn cần nộp muộn.
            </>
          ) : (
            <>
              Assignment &ldquo;{state.assignment.assignmentName}&rdquo; is closed and no longer
              accepting submissions. Please contact your instructor if your team needs late submission.
            </>
          )}
        </Alert>
      </div>
    );
  }

  // state.kind === 'open' — Requirement 1.7 đã thoả: có đúng 1 assignment
  // đang OPEN được xác định, giờ mới cho phép điền form.
  return (
    <div className="fcaj-form-card">
      <button type="button" className="fcaj-back-btn" onClick={goToAssignmentList}>
        ← {t('btnChooseOther')}
      </button>

      <div
        style={{
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: '1px solid var(--fcaj-card-border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '1.75rem',
              fontWeight: 800,
              color: 'var(--fcaj-text-primary)',
            }}
          >
            {t('submitFormTitle')}
          </h2>
          <span className="fcaj-status-pill">
            <span className="fcaj-status-dot" />
            {t('statusOpen')}
          </span>
        </div>
        <p style={{ margin: '8px 0 0', color: 'var(--fcaj-text-secondary)', fontSize: '0.95rem' }}>
          {language === 'vi'
            ? `Đợt chấm: ${state.assignment.assignmentName}`
            : `Assignment: ${state.assignment.assignmentName}`}
        </p>
      </div>

      <TeamSubmissionForm
        assignment={state.assignment}
        onCancel={goToAssignmentList}
        onSubmitted={(successState) => {
          // `replace: true` để nút Back của trình duyệt không quay về form đã
          // nộp (nhóm bấm Back rồi bấm nộp lần nữa sẽ chỉ nhận lỗi trùng tên).
          navigate('/submit-success', { state: successState, replace: true });
        }}
      />
    </div>
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
  const { t, language } = useLanguage();
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
   */
  const describeSubmitError = useCallback(
    (error: unknown): SubmitState => {
      if (error instanceof TeamNameConflictError) {
        return {
          kind: 'failed',
          header: language === 'vi' ? 'Tên nhóm đã được sử dụng' : 'Team Name Already in Use',
          message: error.message,
          blocking: false,
        };
      }
      if (error instanceof AssignmentClosedError) {
        return {
          kind: 'failed',
          header: language === 'vi' ? 'Đợt chấm đã đóng' : 'Assignment Closed',
          message: error.message,
          blocking: true,
        };
      }
      if (error instanceof NotFoundError) {
        return {
          kind: 'failed',
          header: language === 'vi' ? 'Không tìm thấy đợt chấm' : 'Assignment Not Found',
          message: error.message,
          blocking: true,
        };
      }
      if (error instanceof ValidationError) {
        return {
          kind: 'failed',
          header: language === 'vi' ? 'Thông tin chưa hợp lệ' : 'Invalid Submission Data',
          message: error.message,
          blocking: false,
        };
      }
      return {
        kind: 'failed',
        header: language === 'vi' ? 'Không nộp được bài' : 'Submission Failed',
        message:
          language === 'vi'
            ? 'Đã xảy ra lỗi hệ thống khi ghi nhận bài nộp. Bài của nhóm CHƯA được ghi nhận, vui lòng thử lại.'
            : 'A system error occurred while recording your submission. Your team submission has NOT been recorded, please try again.',
        blocking: false,
      };
    },
    [language],
  );

  const handleSubmit = useCallback(async () => {
    const draft = { teamName, members, mdFile, xmlFile };
    const nextErrors = validateSubmitForm(draft);
    setErrors(nextErrors);

    if (hasSubmitFormErrors(nextErrors)) {
      setSubmitState({
        kind: 'failed',
        header: language === 'vi' ? 'Thông tin chưa hợp lệ' : 'Invalid Submission Data',
        message:
          language === 'vi'
            ? 'Vui lòng kiểm tra lại các ô được đánh dấu lỗi phía dưới.'
            : 'Please review and fix the flagged errors below before submitting.',
        blocking: false,
      });
      return;
    }

    if (draft.mdFile === null || draft.xmlFile === null) {
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

      onSubmitted({
        teamName: result.team.teamName,
        assignmentName: assignment.assignmentName,
        fileNames: result.files.map((file) => file.fileName),
        resubmitted: result.resubmitted,
      });
    } catch (error: unknown) {
      console.error('[TeamSubmissionForm] Nộp bài thất bại:', error);
      setSubmitState(describeSubmitError(error));
    }
  }, [assignment, describeSubmitError, language, mdFile, members, onSubmitted, teamName, xmlFile]);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <Form
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onCancel} disabled={submitting}>
              {t('btnCancel')}
            </Button>
            <Button variant="primary" formAction="submit" loading={submitting} disabled={blocked}>
              {t('btnSubmitForm')}
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
                  <Button onClick={onCancel}>{t('btnChooseOther')}</Button>
                ) : undefined
              }
            >
              {submitState.message}
            </Alert>
          )}

          <FormField
            label={t('teamNameLabel')}
            description={t('teamNameDesc')}
            errorText={errors.teamName}
          >
            <Input
              value={teamName}
              disabled={submitting}
              placeholder={t('teamNamePlaceholder')}
              ariaLabel="Tên nhóm"
              onChange={({ detail }) => setTeamName(detail.value)}
            />
          </FormField>

          <FormField
            label={t('membersLabel')}
            description={t('membersDesc')}
          >
            <MemberListEditor
              members={members}
              errors={errors.members}
              disabled={submitting}
              onChange={setMembers}
            />
          </FormField>

          <FileUploadField
            label={t('mdFileLabel')}
            description={t('mdFileDesc')}
            extension=".md"
            value={mdFile}
            errorText={errors.mdFile}
            onChange={({ file, error }) => {
              setMdFile(file);
              setErrors((current) => ({ ...current, mdFile: error }));
            }}
          />

          <FileUploadField
            label={t('xmlFileLabel')}
            description={t('xmlFileDesc')}
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

