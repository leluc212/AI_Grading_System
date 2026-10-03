/**
 * Modal tạo Assignment mới (task 7.2).
 *
 * Dùng modal thay vì 1 trang riêng vì form chỉ có đúng 1 field — điều hướng
 * sang trang khác rồi quay lại chỉ làm Admin mất ngữ cảnh danh sách.
 *
 * Validate tên không rỗng ở client (Requirement 1.2) để không gửi request
 * chắc chắn sai; server validate lại bằng cùng quy tắc và trả
 * `ValidationError` — nếu vì lý do nào đó lọt qua client, lỗi của server vẫn
 * được hiển thị.
 *
 * _Requirements: 1.1, 1.2_
 */
import { useCallback, useEffect, useState } from 'react';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { assignmentsApi } from '../services';
import { toDisplayMessage } from '../errorMessage';

export interface CreateAssignmentModalProps {
  visible: boolean;
  onDismiss: () => void;
  /** Gọi sau khi tạo thành công, để trang cha tải lại danh sách. */
  onCreated: (assignmentName: string) => void;
}

export function CreateAssignmentModal({
  visible,
  onDismiss,
  onCreated,
}: CreateAssignmentModalProps) {
  const [assignmentName, setAssignmentName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  // Dọn sạch form mỗi lần modal mở lại: nếu giữ nguyên, Admin mở modal lần 2
  // sẽ thấy tên cũ và thông báo lỗi cũ của lần trước.
  useEffect(() => {
    if (visible) {
      setAssignmentName('');
      setNameError(undefined);
      setSubmitError(undefined);
    }
  }, [visible]);

  const handleSubmit = useCallback(async () => {
    // Requirement 1.2: tên rỗng hoặc chỉ có khoảng trắng đều bị từ chối.
    const trimmed = assignmentName.trim();
    if (trimmed.length === 0) {
      setNameError('Tên đợt chấm không được để trống.');
      return;
    }
    setNameError(undefined);
    setSubmitError(undefined);
    setSubmitting(true);

    try {
      // Gửi tên đã trim để không lưu `" Đợt 1 "` vào cơ sở dữ liệu.
      const created = await assignmentsApi.createAssignment({ assignmentName: trimmed });
      onCreated(created.assignmentName);
    } catch (error: unknown) {
      console.error('[CreateAssignmentModal] Tạo đợt chấm thất bại:', error);
      setSubmitError(
        toDisplayMessage(error, 'Không tạo được đợt chấm do lỗi hệ thống. Vui lòng thử lại.'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [assignmentName, onCreated]);

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Tạo đợt chấm mới"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss} disabled={submitting}>
              Huỷ
            </Button>
            <Button
              variant="primary"
              loading={submitting}
              onClick={() => {
                void handleSubmit();
              }}
            >
              Tạo
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      {/*
        `<form>` bọc ngoài để gõ Enter trong ô là submit được (hành vi mong
        đợi với form 1 field). `noValidate` để thông báo lỗi luôn là của
        Cloudscape, không phải tooltip mặc định của trình duyệt (design.md >
        Error Handling).
      */}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <Form>
          <SpaceBetween size="m">
            {submitError !== undefined && (
              <Alert type="error" header="Không tạo được đợt chấm">
                {submitError}
              </Alert>
            )}
            <FormField
              label="Tên đợt chấm"
              description="Ví dụ: Đợt 1 - Lập trình Web - K21"
              errorText={nameError}
            >
              <Input
                value={assignmentName}
                disabled={submitting}
                autoFocus
                ariaLabel="Tên đợt chấm"
                onChange={({ detail }) => setAssignmentName(detail.value)}
              />
            </FormField>
          </SpaceBetween>
        </Form>
      </form>
    </Modal>
  );
}
