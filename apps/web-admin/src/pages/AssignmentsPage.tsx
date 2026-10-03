/**
 * Trang danh sách Assignment (task 7.1, 7.2).
 *
 * Mỗi dòng hiển thị trạng thái + số nhóm đã nộp (Requirement 1.3), có nút tạo
 * mới (7.2) và nút đóng/mở từng đợt (Requirement 1.4, 1.5).
 *
 * Requirement 1.6 (không có cơ chế tự đóng theo thời gian) được thể hiện bằng
 * việc KHÔNG có cột deadline và KHÔNG có cấu hình hẹn giờ nào ở đây — trạng
 * thái chỉ đổi khi Admin bấm. Mô tả của trang nói rõ điều đó để Admin không đi
 * tìm chỗ đặt deadline.
 *
 * Số nhóm đã nộp lấy từ `submittedTeamCount` do server tính (xem
 * `AssignmentListItem` ở `shared-types`), không tự đếm ở client — nếu đếm ở
 * client thì phải tải Team của mọi assignment chỉ để hiện 1 con số.
 *
 * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AssignmentListItem, AssignmentStatus } from '@quick-grading/shared-types';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { CreateAssignmentModal } from '../components/CreateAssignmentModal';
import { AssignmentStatusBadge } from '../components/StatusBadge';
import { assignmentsApi, exportApi } from '../services';
import { toDisplayMessage } from '../errorMessage';
import { downloadExcelFile, exportAssignmentToExcel } from '../excelExport';
import { formatDateTime } from '../format';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; assignments: AssignmentListItem[] };

export function AssignmentsPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  /**
   * `assignmentId` đang đổi trạng thái, để chỉ nút của ĐÚNG dòng đó hiện
   * spinner (dùng 1 cờ boolean chung sẽ làm mọi nút cùng quay).
   */
  const [togglingId, setTogglingId] = useState<string | null>(null);
  /** `assignmentId` đang xuất Excel — cùng lý do như `togglingId`. */
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | undefined>(undefined);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    assignmentsApi
      .listAssignments()
      .then((assignments) => {
        if (!cancelled) {
          setState({ kind: 'ready', assignments });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        console.error('[AssignmentsPage] Không tải được danh sách đợt chấm:', error);
        setState({
          kind: 'error',
          message: toDisplayMessage(error, 'Không tải được danh sách đợt chấm. Vui lòng thử lại.'),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  /**
   * Đóng/mở 1 đợt chấm (Requirement 1.4, 1.5).
   *
   * Sau khi đổi xong thì tải lại cả danh sách thay vì chỉ sửa 1 dòng trong
   * state: `submittedTeamCount` của các đợt khác có thể đã thay đổi do nhóm
   * vừa nộp bài, nên đọc lại là cách duy nhất chắc chắn đúng.
   */
  const toggleStatus = useCallback(
    async (assignment: AssignmentListItem) => {
      const nextStatus: AssignmentStatus = assignment.status === 'OPEN' ? 'CLOSED' : 'OPEN';
      setTogglingId(assignment.assignmentId);
      setActionError(undefined);
      setActionNotice(undefined);

      try {
        await assignmentsApi.setAssignmentStatus(assignment.assignmentId, nextStatus);
        setActionNotice(
          nextStatus === 'CLOSED'
            ? `Đã đóng đợt chấm "${assignment.assignmentName}". Nhóm không thể nộp bài vào đợt này nữa.`
            : `Đã mở lại đợt chấm "${assignment.assignmentName}". Nhóm có thể nộp bài trở lại.`,
        );
        reload();
      } catch (error: unknown) {
        console.error('[AssignmentsPage] Đổi trạng thái đợt chấm thất bại:', error);
        setActionError(
          toDisplayMessage(error, 'Không đổi được trạng thái đợt chấm. Vui lòng thử lại.'),
        );
      } finally {
        setTogglingId(null);
      }
    },
    [reload],
  );

  /**
   * Xuất điểm của 1 đợt chấm ra `.xlsx` (Requirement 10.1 - 10.4).
   *
   * Toàn bộ việc dựng file diễn ra ở client (xem `src/excelExport.ts`); ở đây
   * chỉ lấy dữ liệu nguồn, dựng blob rồi kích hoạt tải xuống.
   */
  const exportToExcel = useCallback(async (assignment: AssignmentListItem) => {
    setExportingId(assignment.assignmentId);
    setActionError(undefined);
    setActionNotice(undefined);

    try {
      const data = await exportApi.getAssignmentExportData(assignment.assignmentId);
      const { blob, fileName } = await exportAssignmentToExcel(data);
      downloadExcelFile(blob, fileName);
      setActionNotice(`Đã tạo file "${fileName}" cho đợt chấm "${assignment.assignmentName}".`);
    } catch (error: unknown) {
      console.error('[AssignmentsPage] Xuất Excel thất bại:', error);
      setActionError(toDisplayMessage(error, 'Không xuất được file Excel. Vui lòng thử lại.'));
    } finally {
      setExportingId(null);
    }
  }, []);

  const assignments = state.kind === 'ready' ? state.assignments : [];

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description="Đợt chấm chỉ đóng/mở bằng thao tác thủ công — hệ thống không tự đóng theo thời gian."
          actions={
            <Button
              variant="primary"
              iconName="add-plus"
              onClick={() => setCreateModalVisible(true)}
            >
              Tạo đợt chấm
            </Button>
          }
        >
          Đợt chấm
        </Header>
      }
    >
      <SpaceBetween size="m">
        {actionNotice !== undefined && (
          <Alert type="success" dismissible onDismiss={() => setActionNotice(undefined)}>
            {actionNotice}
          </Alert>
        )}
        {actionError !== undefined && (
          <Alert
            type="error"
            header="Thao tác thất bại"
            dismissible
            onDismiss={() => setActionError(undefined)}
          >
            {actionError}
          </Alert>
        )}
        {state.kind === 'error' && (
          <Alert
            type="error"
            header="Không tải được danh sách đợt chấm"
            action={<Button onClick={reload}>Thử lại</Button>}
          >
            {state.message}
          </Alert>
        )}

        <Table
          items={assignments}
          loading={state.kind === 'loading'}
          loadingText="Đang tải danh sách đợt chấm..."
          variant="container"
          trackBy="assignmentId"
          columnDefinitions={[
            {
              id: 'assignmentName',
              header: 'Tên đợt chấm',
              // Tên là đường dẫn vào dashboard nhóm của đợt đó (task 8.1).
              cell: (item) => (
                <Link
                  href={`/assignments/${item.assignmentId}/teams`}
                  onFollow={(event) => {
                    // Giữ `<a href>` thật cho a11y nhưng điều hướng bằng
                    // router để không reload cả app.
                    event.preventDefault();
                    navigate(`/assignments/${item.assignmentId}/teams`);
                  }}
                >
                  {item.assignmentName}
                </Link>
              ),
            },
            {
              id: 'status',
              header: 'Trạng thái',
              cell: (item) => <AssignmentStatusBadge status={item.status} />,
            },
            {
              id: 'submittedTeamCount',
              header: 'Số nhóm đã nộp',
              cell: (item) => item.submittedTeamCount,
            },
            {
              id: 'createdAt',
              header: 'Ngày tạo',
              cell: (item) => formatDateTime(item.createdAt),
            },
            {
              id: 'actions',
              header: 'Hành động',
              cell: (item) => (
                <SpaceBetween direction="horizontal" size="xs">
                  <Button
                    // Nhiều dòng đều có nút này -> nhãn cho screen reader phải
                    // kèm tên đợt chấm để phân biệt.
                    ariaLabel={
                      item.status === 'OPEN'
                        ? `Đóng đợt chấm ${item.assignmentName}`
                        : `Mở lại đợt chấm ${item.assignmentName}`
                    }
                    loading={togglingId === item.assignmentId}
                    onClick={() => {
                      void toggleStatus(item);
                    }}
                  >
                    {item.status === 'OPEN' ? 'Đóng' : 'Mở lại'}
                  </Button>
                  <Button
                    iconName="download"
                    ariaLabel={`Xuất Excel đợt chấm ${item.assignmentName}`}
                    loading={exportingId === item.assignmentId}
                    onClick={() => {
                      void exportToExcel(item);
                    }}
                  >
                    Xuất Excel
                  </Button>
                </SpaceBetween>
              ),
            },
          ]}
          empty={
            <Box textAlign="center" padding="l">
              <SpaceBetween size="xs">
                <Box variant="strong">Chưa có đợt chấm nào</Box>
                <Box variant="p" color="text-body-secondary">
                  Tạo đợt chấm đầu tiên để sinh viên có thể nộp bài.
                </Box>
              </SpaceBetween>
            </Box>
          }
        />
      </SpaceBetween>

      <CreateAssignmentModal
        visible={createModalVisible}
        onDismiss={() => setCreateModalVisible(false)}
        onCreated={(assignmentName) => {
          setCreateModalVisible(false);
          setActionNotice(`Đã tạo đợt chấm "${assignmentName}".`);
          reload();
        }}
      />
    </ContentLayout>
  );
}
