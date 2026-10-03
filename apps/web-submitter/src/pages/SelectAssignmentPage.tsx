/**
 * Trang chọn Assignment (task 5.2).
 *
 * Requirement 1.7: Submitter phải chọn/xác định đúng 1 Assignment đang
 * `OPEN` TRƯỚC khi được điền form nhóm. Trang này là bước đó — nó chỉ liệt
 * kê các đợt chấm đang `OPEN` và điều hướng sang `/submit/:assignmentId`.
 *
 * Vì sao lọc `OPEN` ở client: `assignmentsApi.listAssignments()` trả về TẤT
 * CẢ assignment (endpoint này dùng chung với dashboard Admin, nơi cần thấy cả
 * `CLOSED`). Khu vực public thì chỉ được thấy đợt đang mở, nên lọc ở đây.
 * Việc lọc này CHỈ là UX — nó không phải cơ chế bảo vệ: Submitter vẫn có thể
 * gõ tay URL `/submit/<id-của-assignment-đã-đóng>`, nên chốt chặn thật nằm ở
 * `SubmitFormPage` (Requirement 1.8) và cuối cùng là ở server
 * (`AssignmentClosedError` khi nộp).
 *
 * _Requirements: 1.7, 1.8_
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Assignment } from '@quick-grading/shared-types';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Cards from '@cloudscape-design/components/cards';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import { assignmentsApi } from '../services';
import { toDisplayMessage } from '../errorMessage';
import { formatDateTime } from '../format';

/**
 * Trạng thái tải danh sách, mô hình hoá dạng discriminated union để không
 * bao giờ tồn tại tổ hợp vô nghĩa (ví dụ vừa `loading` vừa có `errorMessage`).
 */
type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; openAssignments: Assignment[] };

export function SelectAssignmentPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  /**
   * Tăng lên mỗi lần bấm "Thử lại" để `useEffect` chạy lại. Dùng counter
   * thay vì gọi trực tiếp hàm load trong `onClick` để chỉ có DUY NHẤT 1 nơi
   * thực hiện việc tải + 1 nơi xử lý huỷ (tránh 2 luồng cập nhật state song
   * song khi người dùng bấm "Thử lại" liên tục).
   */
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    // Cờ chống cập nhật state sau khi component đã unmount (hoặc sau khi
    // effect bị thay thế bởi lần reload mới). Cần thiết vì `StrictMode` ở
    // dev chạy effect 2 lần, và vì người dùng có thể rời trang trước khi
    // request xong.
    let cancelled = false;

    setState({ kind: 'loading' });

    assignmentsApi
      .listAssignments()
      .then((assignments) => {
        if (cancelled) {
          return;
        }
        setState({
          kind: 'ready',
          openAssignments: assignments.filter((assignment) => assignment.status === 'OPEN'),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        // Log nguyên lỗi để debug, nhưng hiển thị câu thân thiện cho sinh viên.
        console.error('[SelectAssignmentPage] Không tải được danh sách đợt chấm:', error);
        setState({
          kind: 'error',
          message: toDisplayMessage(error, 'Không tải được danh sách đợt chấm. Vui lòng thử lại.'),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const retry = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const goToSubmitForm = useCallback(
    (assignmentId: string) => {
      navigate(`/submit/${encodeURIComponent(assignmentId)}`);
    },
    [navigate],
  );

  return (
    <Container
      header={
        <Header variant="h2" description="Chọn đợt chấm mà nhóm bạn cần nộp bài">
          Chọn bài tập cần nộp
        </Header>
      }
    >
      {state.kind === 'loading' && (
        <Box textAlign="center" padding="l">
          <SpaceBetween size="s" alignItems="center">
            <Spinner size="large" />
            <Box variant="p">Đang tải danh sách đợt chấm...</Box>
          </SpaceBetween>
        </Box>
      )}

      {state.kind === 'error' && (
        <Alert
          type="error"
          header="Không tải được danh sách đợt chấm"
          action={<Button onClick={retry}>Thử lại</Button>}
        >
          {state.message}
        </Alert>
      )}

      {state.kind === 'ready' && (
        <Cards
          items={state.openAssignments}
          trackBy="assignmentId"
          cardsPerRow={[{ cards: 1 }, { minWidth: 600, cards: 2 }]}
          // Không truyền `ariaLabels`: type của Cloudscape yêu cầu khai báo
          // cả `itemSelectionLabel` + `selectionGroupLabel` cùng lúc, nhưng
          // danh sách này KHÔNG có chọn nhiều item -> hai nhãn đó là prop
          // chết. Ngữ cảnh cho screen reader đã có từ heading h2 của
          // `Container` bao ngoài, và mỗi nút hành động có `ariaLabel` riêng
          // kèm tên đợt chấm.
          cardDefinition={{
            header: (assignment) => assignment.assignmentName,
            sections: [
              {
                id: 'createdAt',
                header: 'Ngày tạo',
                content: (assignment) => formatDateTime(assignment.createdAt),
              },
              {
                id: 'action',
                content: (assignment) => (
                  <Button
                    variant="primary"
                    // Nhiều card đều có nút "Nộp bài" -> nhãn cho screen
                    // reader phải kèm tên đợt chấm để phân biệt được.
                    ariaLabel={`Nộp bài cho đợt chấm ${assignment.assignmentName}`}
                    onClick={() => goToSubmitForm(assignment.assignmentId)}
                  >
                    Nộp bài
                  </Button>
                ),
              },
            ],
          }}
          empty={
            <Box textAlign="center" padding="l">
              <SpaceBetween size="xs">
                <Box variant="strong">Hiện không có đợt chấm nào đang mở</Box>
                <Box variant="p" color="text-body-secondary">
                  Vui lòng liên hệ giảng viên nếu bạn cho rằng đây là sự nhầm lẫn.
                </Box>
              </SpaceBetween>
            </Box>
          }
        />
      )}
    </Container>
  );
}
