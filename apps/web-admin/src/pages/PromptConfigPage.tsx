/**
 * Trang cấu hình System Prompt & Chế độ chấm điểm AI (`PromptConfigPage`).
 *
 * Cho phép Admin:
 *   - Lựa chọn phương thức chấm: Rubric (Tiêu chí), Prompt (System Prompt tự do), hoặc Hybrid (Kết hợp).
 *   - Soạn thảo System Prompt chi tiết hướng dẫn AI cách đánh giá, cho điểm và nhận xét bài làm.
 *   - Cung cấp mẫu prompt chuẩn cho đồ án môn học để Admin dễ dàng tham khảo và sử dụng.
 *   - Lưu phiên bản cấu hình mới (giữ lại các phiên bản cũ để tra cứu lịch sử).
 *   - Xem danh sách lịch sử các phiên bản cấu hình.
 */
import { useCallback, useEffect, useState } from 'react';
import type { GradingConfig, GradingMode } from '@quick-grading/shared-types';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import RadioGroup from '@cloudscape-design/components/radio-group';
import Select from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Textarea from '@cloudscape-design/components/textarea';
import { PromptVersionHistory } from '../components/PromptVersionHistory';
import { gradingConfigApi } from '../services';
import { toDisplayMessage } from '../errorMessage';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; active: GradingConfig | null; versions: GradingConfig[] };

const PROMPT_TEMPLATE = `Bạn là trợ lý AI chấm đồ án sinh viên. Hãy đánh giá bài nộp dựa trên các tiêu chuẩn sau:

1. Tính đúng đắn và hoàn thiện chức năng (40 điểm):
- Đầy đủ các luồng xử lý chính theo đặc tả đề bài.
- Chương trình hoạt động ổn định, không có lỗi cú pháp hoặc logic làm gián đoạn luồng.

2. Kiến trúc và chất lượng mã nguồn (30 điểm):
- Cấu trúc thư mục, đặt tên module, biến, hàm rõ ràng và nhất quán.
- Áp dụng các nguyên lý lập trình tốt (tách biệt trách nhiệm, xử lý ngoại lệ, bảo mật).

3. Báo cáo và tài liệu kỹ thuật (20 điểm):
- Báo cáo trình bày mạch lạc, giải thích rõ ràng các giải pháp kiến trúc đã chọn.
- Có hướng dẫn cài đặt, chạy thử và kiểm thử rõ ràng.

4. Tối ưu hiệu năng và sáng tạo (10 điểm):
- Có giải pháp tối ưu tài nguyên, hiệu năng hoặc các tính năng mở rộng hữu ích.

QUY TẮC ĐẶC BIỆT:
- Cho điểm tổng kết chính xác trên thang điểm 0 - 100 theo tiêu chuẩn trên.
- Nhận xét chi tiết (feedback): nêu rõ ưu điểm lớn nhất, nhược điểm cần cải thiện và lời khuyên cụ thể cho sinh viên.`;

const MAX_PROMPT_LENGTH = 8000;

export function PromptConfigPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  const [mode, setMode] = useState<GradingMode>('RUBRIC');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<string>('');
  const [maxInputTokens, setMaxInputTokens] = useState('50000');
  const [maxOutputTokens, setMaxOutputTokens] = useState('2000');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>(undefined);
  const [saveNotice, setSaveNotice] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    Promise.all([
      gradingConfigApi.getActiveGradingConfig(),
      gradingConfigApi.listGradingConfigVersions(),
    ])
      .then(([active, versions]) => {
        if (cancelled) return;
        setState({ kind: 'ready', active: active ?? null, versions: versions ?? [] });

        if (active) {
          setMode(active.mode);
          setSystemPrompt(active.systemPrompt ?? '');
          setModel(active.model ?? '');
          setReasoningEffort(active.reasoningEffort ?? '');
          setMaxInputTokens(String(active.maxInputTokens ?? 50000));
          setMaxOutputTokens(String(active.maxOutputTokens ?? 2000));
        } else {
          setMode('RUBRIC');
          setSystemPrompt('');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('[PromptConfigPage] Lỗi tải cấu hình:', error);
        setState({
          kind: 'error',
          message: toDisplayMessage(error, 'Không tải được cấu hình chấm điểm. Vui lòng thử lại.'),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const handleReset = useCallback(() => {
    if (state.kind !== 'ready') return;
    const active = state.active;
    if (active) {
      setMode(active.mode);
      setSystemPrompt(active.systemPrompt ?? '');
      setModel(active.model ?? '');
      setReasoningEffort(active.reasoningEffort ?? '');
      setMaxInputTokens(String(active.maxInputTokens ?? 50000));
      setMaxOutputTokens(String(active.maxOutputTokens ?? 2000));
    } else {
      setMode('RUBRIC');
      setSystemPrompt('');
      setModel('');
      setReasoningEffort('');
      setMaxInputTokens('50000');
      setMaxOutputTokens('2000');
    }
    setSaveError(undefined);
    setSaveNotice(undefined);
  }, [state]);

  const handleApplyTemplate = useCallback(() => {
    setSystemPrompt(PROMPT_TEMPLATE);
    if (mode === 'RUBRIC') {
      setMode('PROMPT');
    }
  }, [mode]);

  const handleSave = useCallback(async () => {
    setSaveError(undefined);
    setSaveNotice(undefined);

    if ((mode === 'PROMPT' || mode === 'HYBRID') && systemPrompt.trim().length === 0) {
      setSaveError(`Chế độ ${mode} yêu cầu bạn phải nhập nội dung System Prompt.`);
      return;
    }

    if (systemPrompt.length > MAX_PROMPT_LENGTH) {
      setSaveError(`System Prompt không được vượt quá ${MAX_PROMPT_LENGTH.toLocaleString()} ký tự.`);
      return;
    }

    setSaving(true);
    try {
      const saved = await gradingConfigApi.saveGradingConfig({
        mode,
        systemPrompt: systemPrompt.trim().length > 0 ? systemPrompt.trim() : undefined,
        model: model.trim().length > 0 ? model.trim() : undefined,
        reasoningEffort: reasoningEffort === 'low' || reasoningEffort === 'medium' ? reasoningEffort : undefined,
        maxInputTokens: Number(maxInputTokens) || 50000,
        maxOutputTokens: Number(maxOutputTokens) || 2000,
      });

      setSaveNotice(
        `Đã lưu và kích hoạt cấu hình phiên bản ${saved.version} (Chế độ: ${saved.mode}) thành công! Các lượt chấm mới sẽ áp dụng cấu hình này.`,
      );
      setReloadToken((t) => t + 1);
    } catch (error: unknown) {
      console.error('[PromptConfigPage] Lỗi lưu cấu hình:', error);
      setSaveError(toDisplayMessage(error, 'Không lưu được cấu hình chấm điểm. Vui lòng thử lại.'));
    } finally {
      setSaving(false);
    }
  }, [mode, systemPrompt, model, reasoningEffort, maxInputTokens, maxOutputTokens]);

  if (state.kind === 'loading') {
    return (
      <ContentLayout header={<Header variant="h1">Cấu hình AI & System Prompt chấm điểm</Header>}>
        <Container>
          <Box textAlign="center" padding="xxl">
            <SpaceBetween size="m">
              <Spinner size="large" />
              <Box variant="p" color="text-body-secondary">
                Đang tải cấu hình chấm điểm...
              </Box>
            </SpaceBetween>
          </Box>
        </Container>
      </ContentLayout>
    );
  }

  if (state.kind === 'error') {
    return (
      <ContentLayout header={<Header variant="h1">Cấu hình AI & System Prompt chấm điểm</Header>}>
        <SpaceBetween size="l">
          <Alert
            type="error"
            action={<Button onClick={() => setReloadToken((t) => t + 1)}>Thử lại</Button>}
          >
            {state.message}
          </Alert>
        </SpaceBetween>
      </ContentLayout>
    );
  }

  const activeVersionText =
    state.active != null
      ? `Đang áp dụng phiên bản ${state.active.version} (${state.active.mode}). Mỗi lần lưu sẽ tạo một phiên bản mới, phiên bản cũ được giữ lại.`
      : 'Hệ thống chưa có phiên bản cấu hình tuỳ chỉnh nào. Đang dùng mặc định (Chấm bằng Rubric). Mỗi lần lưu sẽ tạo một phiên bản mới.';

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={activeVersionText}
        >
          Cấu hình AI & System Prompt chấm điểm
        </Header>
      }
    >
      <SpaceBetween size="l">
        {saveNotice !== undefined && (
          <Alert type="success" dismissible onDismiss={() => setSaveNotice(undefined)}>
            {saveNotice}
          </Alert>
        )}

        {saveError !== undefined && (
          <Alert type="error" dismissible onDismiss={() => setSaveError(undefined)}>
            {saveError}
          </Alert>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <Form
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" disabled={saving} onClick={handleReset}>
                  Hoàn tác thay đổi
                </Button>
                <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
                  Lưu phiên bản mới
                </Button>
              </SpaceBetween>
            }
          >
            <Container
              header={
                <Header
                  variant="h2"
                  description="Chọn cách AI sẽ đánh giá bài nộp của sinh viên."
                >
                  Phương thức chấm điểm
                </Header>
              }
            >
              <SpaceBetween size="l">
                <FormField
                  label="Chế độ chấm điểm"
                  description="Lựa chọn cách AI phân tích và cho điểm đồ án"
                >
                  <RadioGroup
                    value={mode}
                    onChange={({ detail }) => setMode(detail.value as GradingMode)}
                    items={[
                      {
                        value: 'RUBRIC',
                        label: '🎯 Chấm theo Rubric tiêu chí (Mặc định)',
                        description:
                          'AI phân tích bài nộp và cho điểm chi tiết theo từng tiêu chí kèm trọng số % trong bảng Rubric (quản lý tại mục "Cấu hình rubric").',
                      },
                      {
                        value: 'PROMPT',
                        label: '✍️ Chấm bằng System Prompt (Chỉ dẫn tự do)',
                        description:
                          'AI chấm điểm hoàn toàn dựa trên hướng dẫn, tiêu chuẩn và thang điểm do bạn viết trong System Prompt bên dưới (không cần Rubric).',
                      },
                      {
                        value: 'HYBRID',
                        label: '🔀 Chế độ kết hợp (Rubric + System Prompt)',
                        description:
                          'AI vừa chia điểm theo từng tiêu chí trong Rubric, vừa tuân thủ các quy tắc và lưu ý bổ sung từ System Prompt.',
                      },
                    ]}
                  />
                </FormField>

                {(mode === 'PROMPT' || mode === 'HYBRID') && (
                  <SpaceBetween size="s">
                    <FormField
                      label="Nội dung System Prompt cho AI"
                      description={`Chỉ dẫn chi tiết tiêu chuẩn chấm, thang điểm, yêu cầu và cách nhận xét cho AI. Tối đa ${MAX_PROMPT_LENGTH.toLocaleString()} ký tự.`}
                      constraintText={`${systemPrompt.length} / ${MAX_PROMPT_LENGTH} ký tự`}
                      errorText={
                        systemPrompt.length > MAX_PROMPT_LENGTH
                          ? `Đã vượt quá giới hạn ${MAX_PROMPT_LENGTH} ký tự.`
                          : undefined
                      }
                    >
                      <SpaceBetween size="xs">
                        <Box textAlign="right">
                          <Button
                            variant="inline-link"
                            iconName="insert-row"
                            onClick={handleApplyTemplate}
                          >
                            Điền mẫu Prompt gợi ý cho đồ án
                          </Button>
                        </Box>
                        <Textarea
                          value={systemPrompt}
                          onChange={({ detail }) => setSystemPrompt(detail.value)}
                          placeholder="Nhập hướng dẫn chấm bài cho AI (ví dụ: yêu cầu về kiến trúc, kiểm tra tính đúng đắn, cách trừ điểm, ...)"
                          rows={14}
                          ariaLabel="Nội dung System Prompt"
                        />
                      </SpaceBetween>
                    </FormField>
                  </SpaceBetween>
                )}

                {mode === 'RUBRIC' && (
                  <Alert type="info">
                    Đang chọn chế độ <strong>Chấm theo Rubric</strong>. AI sẽ sử dụng danh sách tiêu chí và trọng số từ trang{' '}
                    <a href="/rubric" style={{ fontWeight: 600, color: 'inherit' }}>
                      Cấu hình rubric
                    </a>
                    . Nếu bạn muốn thêm chỉ dẫn hoặc chấm tự do, hãy chọn <strong>Chấm bằng System Prompt</strong> hoặc <strong>Chế độ kết hợp</strong>.
                  </Alert>
                )}

                <ExpandableSection headerText="Cài đặt mô hình AI nâng cao (Tùy chọn)">
                  <SpaceBetween size="m">
                    <FormField
                      label="Tên Model OpenAI"
                      description="Để trống để dùng model mặc định của hệ thống (gpt-6.1-sol hoặc cấu hình trên AWS SSM)."
                    >
                      <Input
                        value={model}
                        onChange={({ detail }) => setModel(detail.value)}
                        placeholder="gpt-6.1-sol, gpt-4o, ..."
                      />
                    </FormField>

                    <FormField
                      label="Mức độ suy luận (Reasoning Effort)"
                      description="Chỉ áp dụng với các model hỗ trợ reasoning (như chuỗi o-series hoặc gpt-6.1-sol)."
                    >
                      <Select
                        selectedOption={
                          reasoningEffort
                            ? { label: reasoningEffort, value: reasoningEffort }
                            : { label: 'Mặc định (Không đặt)', value: '' }
                        }
                        onChange={({ detail }) => setReasoningEffort(detail.selectedOption.value ?? '')}
                        options={[
                          { label: 'Mặc định (Không đặt)', value: '' },
                          { label: 'low (Nhanh, tiết kiệm token)', value: 'low' },
                          { label: 'medium (Cân bằng, phân tích kỹ)', value: 'medium' },
                        ]}
                      />
                    </FormField>

                    <FormField
                      label="Giới hạn Input Tokens"
                      description="Số lượng token bài làm tối đa gửi tới OpenAI (mặc định 50.000)."
                    >
                      <Input
                        type="number"
                        value={maxInputTokens}
                        onChange={({ detail }) => setMaxInputTokens(detail.value)}
                      />
                    </FormField>

                    <FormField
                      label="Giới hạn Output Tokens"
                      description="Số lượng token tối đa cho kết quả trả về của OpenAI (mặc định 2.000)."
                    >
                      <Input
                        type="number"
                        value={maxOutputTokens}
                        onChange={({ detail }) => setMaxOutputTokens(detail.value)}
                      />
                    </FormField>
                  </SpaceBetween>
                </ExpandableSection>
              </SpaceBetween>
            </Container>
          </Form>
        </form>

        <PromptVersionHistory versions={state.versions} />
      </SpaceBetween>
    </ContentLayout>
  );
}
