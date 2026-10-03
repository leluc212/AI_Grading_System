/**
 * Dashboard danh sách nhóm theo Assignment (task 8.1).
 *
 * Mỗi dòng: tên nhóm, số thành viên, trạng thái nộp bài, trạng thái chấm bài,
 * điểm (Requirement 5.1); kèm bộ lọc theo trạng thái chấm bài (Requirement
 * 5.2).
 *
 * ## Vì sao phải gọi API theo từng nhóm (N+1) ở giai đoạn 1
 *
 * Trạng thái chấm bài KHÔNG nằm trên `Team` mà nằm ở `GradingResult`, và mock
 * server không có endpoint nào trả về trạng thái chấm của nhiều nhóm một
 * lượt. Nên trang này gọi `listTeams` 1 lần rồi `getLatestGrading` cho từng
 * nhóm. Với quy mô 1 lớp học (vài chục nhóm) thì chấp nhận được, nhưng đây
 * đúng là N+1 request: giai đoạn 2 nên bổ sung 1 endpoint trả Team kèm lượt
 * chấm gần nhất (hoặc GSI tương ứng trên DynamoDB) rồi bỏ vòng lặp này.
 *
 * Một lượt chấm lỗi KHÔNG làm sập cả bảng: nhóm nào không đọc được lịch sử
 * chấm sẽ hiển thị "Chưa chấm" và được ghi log — thà thiếu 1 ô còn hơn mất
 * toàn bộ danh sách.
 *
 * _Requirements: 5.1, 5.2_
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Assignment, GradingResult, Team } from '@quick-grading/shared-types';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import Select from '@cloudscape-design/components/select';
import type { SelectProps } from '@cloudscape-design/components/select';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Table from '@cloudscape-design/components/table';
import { GradingStatusBadge, TeamStatusBadge } from '../components/StatusBadge';
import { assignmentsApi, gradingApi, teamsApi } from '../services';
import { toDisplayMessage } from '../errorMessage';
import { formatScore } from '../format';
import type { DerivedGradingStatus } from '../gradingStatus';
import {
  DERIVED_GRADING_STATUS_LABELS,
  DERIVED_GRADING_STATUS_ORDER,
  deriveGradingStatus,
  resolveDisplayScore,
} from '../gradingStatus';

/** 1 dòng trong bảng: Team ghép với lượt chấm gần nhất của nó. */
interface TeamRow {
  team: Team;
  latestGrading: GradingResult | null;
  gradingStatus: DerivedGradingStatus;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; rows: TeamRow[]; assignment: Assignment | null };

/** Giá trị đặc biệt cho lựa chọn "không lọc" trong `Select`. */
const ALL_STATUSES = 'ALL';

const FILTER_OPTIONS: SelectProps.Option[] = [
  { value: ALL_STATUSES, label: 'Tất cả trạng thái chấm bài' },
  ...DERIVED_GRADING_STATUS_ORDER.map((status) => ({
    value: status,
    label: DERIVED_GRADING_STATUS_LABELS[status],
  })),
];

export function TeamsDashboardPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<SelectProps.Option>(FILTER_OPTIONS[0]);

  useEffect(() => {
    let cancelled = false;

    if (assignmentId === undefined || assignmentId.trim().length === 0) {
      setState({ kind: 'error', message: 'Thiếu mã đợt chấm trong đường dẫn.' });
      return;
    }

    setState({ kind: 'loading' });

    async function loadRows(id: string): Promise<LoadState> {
      // Tên đợt chấm chỉ để hiển thị tiêu đề -> nếu lấy không được thì vẫn
      // hiện bảng, không chặn cả trang.
      const assignment = await assignmentsApi.getAssignment(id).catch((error: unknown) => {
        console.error('[TeamsDashboardPage] Không tải được thông tin đợt chấm:', error);
        return null;
      });

      const teams = await teamsApi.listTeams(id);

      const rows = await Promise.all(
        teams.map(async (team): Promise<TeamRow> => {
          const latestGrading = await gradingApi
            .getLatestGrading(team.teamId)
            .catch((error: unknown) => {
              console.error(
                `[TeamsDashboardPage] Không đọc được lịch sử chấm của nhóm ${team.teamId}:`,
                error,
              );
              return null;
            });
          return {
            team,
            latestGrading,
            gradingStatus: deriveGradingStatus(latestGrading),
          };
        }),
      );

      return { kind: 'ready', rows, assignment };
    }

    loadRows(assignmentId)
      .then((next) => {
        if (!cancelled) {
          setState(next);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        console.error('[TeamsDashboardPage] Không tải được danh sách nhóm:', error);
        setState({
          kind: 'error',
          message: toDisplayMessage(error, 'Không tải được danh sách nhóm. Vui lòng thử lại.'),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [assignmentId, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  /**
   * Toàn bộ dòng, hoặc mảng rỗng khi chưa tải xong.
   *
   * Phải bọc `useMemo`: nếu viết thẳng `state.kind === 'ready' ? state.rows : []`
   * thì nhánh `[]` tạo mảng MỚI mỗi lần render, làm dependency của `useMemo`
   * lọc bên dưới đổi liên tục và việc memo hoá trở nên vô nghĩa.
   */
  const allRows = useMemo(() => (state.kind === 'ready' ? state.rows : []), [state]);

  /**
   * Lọc ở client (Requirement 5.2). Dữ liệu trạng thái chấm bài đã được tính
   * sẵn ở trên nên lọc tại đây là tức thì; lọc ở server sẽ cần endpoint mới
   * mà vẫn phải tải lại trạng thái chấm của từng nhóm.
   */
  const visibleRows = useMemo(() => {
    const value = selectedFilter.value;
    if (value === undefined || value === ALL_STATUSES) {
      return allRows;
    }
    return allRows.filter((row) => row.gradingStatus === value);
  }, [allRows, selectedFilter]);

  const assignmentName = state.kind === 'ready' ? state.assignment?.assignmentName : undefined;

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={
            assignmentName !== undefined
              ? `Đợt chấm: ${assignmentName}`
              : 'Danh sách nhóm theo đợt chấm'
          }
          actions={
            <Button iconName="refresh" ariaLabel="Tải lại danh sách nhóm" onClick={reload}>
              Tải lại
            </Button>
          }
        >
          Danh sách nhóm
        </Header>
      }
    >
      <SpaceBetween size="m">
        {state.kind === 'error' && (
          <Alert
            type="error"
            header="Không tải được danh sách nhóm"
            action={<Button onClick={reload}>Thử lại</Button>}
          >
            {state.message}
          </Alert>
        )}

        <Table
          items={visibleRows}
          loading={state.kind === 'loading'}
          loadingText="Đang tải danh sách nhóm..."
          variant="container"
          trackBy={(row) => row.team.teamId}
          header={
            <Header
              counter={
                state.kind === 'ready'
                  ? visibleRows.length === allRows.length
                    ? `(${allRows.length})`
                    : `(${visibleRows.length}/${allRows.length})`
                  : undefined
              }
            >
              Nhóm
            </Header>
          }
          filter={
            <Select
              selectedOption={selectedFilter}
              options={FILTER_OPTIONS}
              ariaLabel="Lọc theo trạng thái chấm bài"
              onChange={({ detail }) => setSelectedFilter(detail.selectedOption)}
            />
          }
          columnDefinitions={[
            {
              id: 'teamName',
              header: 'Tên nhóm',
              cell: (row) => (
                <Link
                  href={`/teams/${row.team.teamId}`}
                  onFollow={(event) => {
                    event.preventDefault();
                    navigate(`/teams/${row.team.teamId}`);
                  }}
                >
                  {row.team.teamName}
                </Link>
              ),
            },
            {
              id: 'memberCount',
              header: 'Số thành viên',
              cell: (row) => row.team.members.length,
            },
            {
              id: 'teamStatus',
              header: 'Trạng thái nộp bài',
              cell: (row) => <TeamStatusBadge status={row.team.status} />,
            },
            {
              id: 'gradingStatus',
              header: 'Trạng thái chấm bài',
              cell: (row) => <GradingStatusBadge status={row.gradingStatus} />,
            },
            {
              id: 'score',
              header: 'Điểm',
              // Ưu tiên finalScore nếu đã review (Requirement 7.6).
              cell: (row) => formatScore(resolveDisplayScore(row.latestGrading)),
            },
          ]}
          empty={
            <Box textAlign="center" padding="l">
              <SpaceBetween size="xs">
                <Box variant="strong">
                  {allRows.length === 0
                    ? 'Chưa có nhóm nào trong đợt chấm này'
                    : 'Không có nhóm nào khớp bộ lọc'}
                </Box>
                {allRows.length > 0 && (
                  <Button onClick={() => setSelectedFilter(FILTER_OPTIONS[0])}>Xoá bộ lọc</Button>
                )}
              </SpaceBetween>
            </Box>
          }
        />
      </SpaceBetween>
    </ContentLayout>
  );
}
