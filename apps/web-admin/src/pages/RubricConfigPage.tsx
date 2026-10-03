/**
 * Trang cấu hình Rubric (task 10.1).
 *
 * Gồm 2 phần: form sửa tiêu chí của rubric đang dùng, và danh sách các phiên
 * bản cũ chỉ-xem.
 *
 * ## Mô hình "lưu là tạo phiên bản mới"
 *
 * Requirement 9.2 yêu cầu lưu rubric mới thì tăng `version` và giữ bản cũ, nên
 * form này KHÔNG sửa trực tiếp bản đang active: nó nạp tiêu chí của bản active
 * làm điểm khởi đầu, Admin sửa rồi bấm Lưu, và server tạo ra 1 phiên bản mới
 * (bản cũ bị deactivate nhưng vẫn còn để tra cứu). Nói rõ điều này trên UI vì
 * nếu Admin tưởng mình đang sửa tại chỗ thì sẽ bất ngờ khi thấy số version
 * tăng.
 *
 * Requirement 9.1 nói cấu trúc chi tiết rubric "có thể để trống ở phiên bản
 * đầu", nên phạm vi ở đây đúng mức tối thiểu mà `RubricCriterion` hỗ trợ:
 * `label` + `weight`. Không bịa thêm field.
 *
 * _Requirements: 9.1, 9.2, 9.3, 9.4_
 */
import { useCallback, useEffect, useState } from 'react';
import type { Rubric } from '@quick-grading/shared-types';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { RubricCriteriaEditor } from '../components/RubricCriteriaEditor';
import { RubricVersionHistory } from '../components/RubricVersionHistory';
import { rubricsApi } from '../services';
import { toDisplayMessage } from '../errorMessage';
import type { CriterionDraft, CriterionErrorMap } from '../rubricDraft';
import {
  EXPECTED_TOTAL_WEIGHT,
  createEmptyCriterion,
  hasCriterionErrors,
  sumWeights,
  toCriterionDrafts,
  toRubricCriteria,
  validateCriteriaDrafts,
} from '../rubricDraft';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; active: Rubric | null; versions: Rubric[] };

export function RubricConfigPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  const [criteria, setCriteria] = useState<CriterionDraft[]>([]);
  const [errors, setErrors] = useState<CriterionErrorMap>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [saveNotice, setSaveNotice] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    Promise.all([rubricsApi.getActiveRubric(), rubricsApi.listRubricVersions()])
      .then(([active, versions]) => {
        if (cancelled) {
          return;
        }
        // Chuẩn hoá ngay tại biên nhận dữ liệu: service layer hứa
        // `Rubric | null` và `Rubric[]`, nhưng nếu backend (giai đoạn 2) trả
        // thiếu field thì `active` có thể là `undefined` và `state.active !== null`
        // sẽ cho qua, dẫn tới đọc `.version` của `undefined` -> trang trắng.
        // Quy về `null`/`[]` để trường hợp xấu nhất chỉ là hiển thị "chưa có
        // rubric".
        setState({ kind: 'ready', active: active ?? null, versions: versions ?? [] });
        // Nạp tiêu chí của bản active làm điểm khởi đầu. Chưa có rubric nào thì
        // mở sẵn 1 dòng trống để Admin bắt đầu nhập ngay.
        setCriteria(
          active == null || active.criteria.length === 0
            ? [createEmptyCriterion()]
            : toCriterionDrafts(active.criteria),
        );
        setErrors({});
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        console.error('[RubricConfigPage] Không tải được rubric:', error);
        setState({
          kind: 'error',
          message: toDisplayMessage(error, 'Không tải được cấu hình rubric. Vui lòng thử lại.'),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reload = useCallback(() => {
    setSaveError(undefined);
    setSaveNotice(undefined);
    setReloadToken((token) => token + 1);
  }, []);

  const handleSave = useCallback(async () => {
    const nextErrors = validateCriteriaDrafts(criteria);
    setErrors(nextErrors);
    setSaveNotice(undefined);

    if (hasCriterionErrors(nextErrors)) {
      setSaveError('Vui lòng kiểm tra lại các ô được đánh dấu lỗi phía dưới.');
      return;
    }

    setSaveError(undefined);
    setSaving(true);
    try {
      const saved = await rubricsApi.saveRubric({ criteria: toRubricCriteria(criteria) });
      setSaveNotice(
        `Đã lưu rubric phiên bản ${saved.version}. Các lượt chấm mới sẽ dùng phiên bản này; phiên bản cũ vẫn được giữ lại.`,
      );
      // Tải lại để danh sách phiên bản và cờ "Đang dùng" khớp với server.
      setReloadToken((token) => token + 1);
    } catch (error: unknown) {
      console.error('[RubricConfigPage] Lưu rubric thất bại:', error);
      setSaveError(toDisplayMessage(error, 'Không lưu được rubric. Vui lòng thử lại.'));
    } finally {
      setSaving(false);
    }
  }, [criteria]);

  if (state.kind === 'loading') {
    return (
      <ContentLayout header={<Header variant="h1">Cấu hình rubric</Header>}>
        <Container>
          <Box textAlign="center" padding="l">
            <SpaceBetween size="s" alignItems="center">
              <Spinner size="large" />
              <Box variant="p">Đang tải cấu hình rubric...</Box>
            </SpaceBetween>
          </Box>
        </Container>
      </ContentLayout>
    );
  }

  if (state.kind === 'error') {
    return (
      <ContentLayout header={<Header variant="h1">Cấu hình rubric</Header>}>
        <Alert
          type="error"
          header="Không tải được cấu hình rubric"
          action={<Button onClick={reload}>Thử lại</Button>}
        >
          {state.message}
        </Alert>
      </ContentLayout>
    );
  }

  const totalWeight = sumWeights(criteria);
  // Lệch tổng trọng số chỉ là CẢNH BÁO, không chặn lưu: `requirements.md`
  // không quy định tổng phải bằng 100, và `weight` vốn là field optional.
  const weightMismatch = totalWeight !== EXPECTED_TOTAL_WEIGHT;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={
            state.active !== null
              ? `Đang dùng phiên bản ${state.active.version}. Mỗi lần lưu sẽ tạo một phiên bản mới, phiên bản cũ được giữ lại.`
              : 'Chưa có rubric nào. Lần lưu đầu tiên sẽ tạo phiên bản 1.'
          }
        >
          Cấu hình rubric
        </Header>
      }
    >
      <SpaceBetween size="l">
        {saveNotice !== undefined && (
          <Alert type="success" dismissible onDismiss={() => setSaveNotice(undefined)}>
            {saveNotice}
          </Alert>
        )}

        <form
          // `noValidate`: thông báo lỗi do Cloudscape hiển thị, không phải
          // tooltip mặc định của trình duyệt (design.md > Error Handling).
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <Form
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" onClick={reload} disabled={saving}>
                  Hoàn tác thay đổi
                </Button>
                <Button variant="primary" formAction="submit" loading={saving}>
                  Lưu phiên bản mới
                </Button>
              </SpaceBetween>
            }
          >
            <Container header={<Header variant="h2">Tiêu chí chấm điểm</Header>}>
              <SpaceBetween size="l">
                {saveError !== undefined && (
                  <Alert type="error" header="Không lưu được rubric">
                    {saveError}
                  </Alert>
                )}

                <FormField
                  label="Danh sách tiêu chí"
                  description="Tên tiêu chí là bắt buộc. Trọng số tuỳ chọn, tính theo phần trăm."
                >
                  <RubricCriteriaEditor
                    criteria={criteria}
                    errors={errors}
                    disabled={saving}
                    onChange={setCriteria}
                  />
                </FormField>

                <Box>
                  <Box variant="awsui-key-label">Tổng trọng số</Box>
                  <Box variant="p">{totalWeight}</Box>
                </Box>

                {weightMismatch && (
                  <Alert type="warning">
                    Tổng trọng số hiện tại là {totalWeight}, khác {EXPECTED_TOTAL_WEIGHT}. Bạn vẫn
                    có thể lưu — đây chỉ là nhắc nhở để tránh gõ sai.
                  </Alert>
                )}
              </SpaceBetween>
            </Container>
          </Form>
        </form>

        <RubricVersionHistory versions={state.versions} />
      </SpaceBetween>
    </ContentLayout>
  );
}
