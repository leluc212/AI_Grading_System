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
import type { TableProps } from '@cloudscape-design/components/table';
import Table from '@cloudscape-design/components/table';
import { GradingStatusBadge, TeamStatusBadge } from '../components/StatusBadge';
import { useAdminAuth } from '../auth/AdminAuthContext';
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
export interface TeamRow {
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

function TeamNameCell({
  teamId,
  teamName,
  onNavigate,
}: {
  readonly teamId: string;
  readonly teamName: string;
  readonly onNavigate: (path: string) => void;
}) {
  return (
    <Link
      href={`/teams/${teamId}`}
      onFollow={(event) => {
        event.preventDefault();
        onNavigate(`/teams/${teamId}`);
      }}
    >
      {teamName}
    </Link>
  );
}

function buildTeamColumns(
  navigate: (path: string) => void,
  onFilterStatus: (status: DerivedGradingStatus) => void,
): TableProps.ColumnDefinition<TeamRow>[] {
  return [
    {
      id: 'teamName',
      header: 'Tên nhóm',
      sortingField: 'teamName',
      cell: (row) => (
        <TeamNameCell teamId={row.team.teamId} teamName={row.team.teamName} onNavigate={navigate} />
      ),
    },
    {
      id: 'memberCount',
      header: 'Số thành viên',
      sortingField: 'memberCount',
      cell: (row) => row.team.members.length,
    },
    {
      id: 'teamStatus',
      header: 'Trạng thái nộp bài',
      sortingField: 'teamStatus',
      cell: (row) => <TeamStatusBadge status={row.team.status} />,
    },
    {
      id: 'gradingStatus',
      header: 'Trạng thái chấm bài',
      sortingField: 'gradingStatus',
      cell: (row) => (
        <div
          role="button"
          tabIndex={0}
          title={`Bấm để lọc theo trạng thái: ${DERIVED_GRADING_STATUS_LABELS[row.gradingStatus]}`}
          style={{
            cursor: 'pointer',
            display: 'inline-block',
            padding: '2px 4px',
            borderRadius: '4px',
          }}
          className="aws-smooth-card"
          onClick={() => onFilterStatus(row.gradingStatus)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onFilterStatus(row.gradingStatus);
            }
          }}
        >
          <GradingStatusBadge status={row.gradingStatus} />
        </div>
      ),
    },
    {
      id: 'score',
      header: 'Điểm',
      sortingField: 'score',
      // Ưu tiên finalScore nếu đã review (Requirement 7.6).
      cell: (row) => formatScore(resolveDisplayScore(row.latestGrading)),
    },
  ];
}

export function TeamsDashboardPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const { admin } = useAdminAuth();
  const adminUsername = admin?.username ?? 'admin';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedFilter, setSelectedFilter] = useState<SelectProps.Option>(FILTER_OPTIONS[0]);

  // Sắp xếp cột (Requirement: sort Điểm từ cao đến thấp / từ thấp đến cao)
  const [sortingColumn, setSortingColumn] = useState<TableProps.SortingColumn<TeamRow> | undefined>(
    undefined,
  );
  const [isDescending, setIsDescending] = useState<boolean>(true);

  // Chọn nhóm và chấm hàng loạt
  const [selectedRows, setSelectedRows] = useState<TeamRow[]>([]);
  const [batchGrading, setBatchGrading] = useState(false);
  const [batchNotice, setBatchNotice] = useState<string | undefined>(undefined);
  const [batchError, setBatchError] = useState<string | undefined>(undefined);

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
   */
  const allRows = useMemo(() => (state.kind === 'ready' ? state.rows : []), [state]);

  /** Tự động poll mỗi 3 giây khi có bài đang chấm (IN_PROGRESS) */
  const hasInProgress = useMemo(
    () => allRows.some((row) => row.gradingStatus === 'IN_PROGRESS'),
    [allRows],
  );

  useEffect(() => {
    if (!hasInProgress) {
      return;
    }
    const intervalId = setInterval(() => {
      reload();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [hasInProgress, reload]);

  /**
   * Lọc nhanh theo Trạng thái chấm bài khi click vào badge trạng thái trong cell.
   * Nếu đang lọc đúng trạng thái đó rồi thì click lại sẽ huỷ lọc (quay về ALL).
   */
  const handleFilterStatus = useCallback(
    (status: DerivedGradingStatus) => {
      if (selectedFilter.value === status) {
        setSelectedFilter(FILTER_OPTIONS[0]);
      } else {
        const option = FILTER_OPTIONS.find((opt) => opt.value === status);
        if (option) {
          setSelectedFilter(option);
        }
      }
    },
    [selectedFilter.value],
  );

  /**
   * Lọc ở client (Requirement 5.2). Dữ liệu trạng thái chấm bài đã được tính
   * sẵn ở trên nên lọc tại đây là tức thì.
   */
  const visibleRows = useMemo(() => {
    const value = selectedFilter.value;
    if (value === undefined || value === ALL_STATUSES) {
      return allRows;
    }
    return allRows.filter((row) => row.gradingStatus === value);
  }, [allRows, selectedFilter]);

  /**
   * Sắp xếp các dòng đã lọc theo cột và chiều được chọn.
   * Xử lý thông minh cho cột Điểm: các bài chưa có điểm (null/—) luôn nằm ở cuối bảng.
   */
  const sortedRows = useMemo(() => {
    if (!sortingColumn) {
      return visibleRows;
    }

    const { sortingField } = sortingColumn;
    const isDesc = isDescending;

    return [...visibleRows].sort((a, b) => {
      if (sortingField === 'score') {
        const scoreA = resolveDisplayScore(a.latestGrading);
        const scoreB = resolveDisplayScore(b.latestGrading);
        if (scoreA === null && scoreB === null) return 0;
        if (scoreA === null) return 1; // null luôn ở cuối
        if (scoreB === null) return -1; // null luôn ở cuối
        return isDesc ? scoreB - scoreA : scoreA - scoreB;
      }
      if (sortingField === 'gradingStatus') {
        const cmp = a.gradingStatus.localeCompare(b.gradingStatus);
        return isDesc ? -cmp : cmp;
      }
      if (sortingField === 'teamName') {
        const cmp = a.team.teamName.localeCompare(b.team.teamName);
        return isDesc ? -cmp : cmp;
      }
      if (sortingField === 'memberCount') {
        const diff = a.team.members.length - b.team.members.length;
        return isDesc ? -diff : diff;
      }
      if (sortingField === 'teamStatus') {
        const cmp = a.team.status.localeCompare(b.team.status);
        return isDesc ? -cmp : cmp;
      }
      return 0;
    });
  }, [visibleRows, sortingColumn, isDescending]);

  /**
   * Danh sách nhóm được chọn hợp lệ để chấm (chỉ các nhóm đã nộp và không đang chấm).
   */
  const eligibleSelectedRows = useMemo(
    () =>
      selectedRows.filter(
        (row) => row.team.status === 'SUBMITTED' && row.gradingStatus !== 'IN_PROGRESS',
      ),
    [selectedRows],
  );

  /**
   * Chấm tất cả các nhóm đã chọn:
   * Đưa vào queue SQS tuần tự từng nhóm, mỗi bài 1 phiên AI riêng biệt để chống hallucination.
   */
  const handleBatchGrade = useCallback(async () => {
    if (eligibleSelectedRows.length === 0) {
      return;
    }

    setBatchGrading(true);
    setBatchError(undefined);
    setBatchNotice(undefined);

    const total = eligibleSelectedRows.length;
    let successCount = 0;
    const failedTeams: string[] = [];

    for (const row of eligibleSelectedRows) {
      try {
        await gradingApi.triggerGrading(row.team.teamId, adminUsername);
        successCount += 1;
        // Delay nhẹ 100ms giữa các dispatch để đường truyền mạng ổn định
        if (total > 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (err) {
        console.error(`[TeamsDashboardPage] Lỗi khi gửi chấm nhóm ${row.team.teamName}:`, err);
        failedTeams.push(row.team.teamName);
      }
    }

    setBatchGrading(false);
    setSelectedRows([]);

    if (failedTeams.length > 0) {
      setBatchError(
        `Đã đưa ${successCount}/${total} nhóm vào hàng đợi. Có ${failedTeams.length} nhóm gặp lỗi: ${failedTeams.join(', ')}.`,
      );
    } else {
      setBatchNotice(
        `Đã đưa toàn bộ ${successCount} nhóm vào hàng đợi chấm bài thành công! Mỗi bài sẽ được AI chấm riêng biệt trong phiên độc lập để tránh hallucination.`,
      );
    }

    reload();
  }, [adminUsername, eligibleSelectedRows, reload]);

  const counterText = useMemo(() => {
    if (state.kind !== 'ready') {
      return undefined;
    }
    if (visibleRows.length === allRows.length) {
      return `(${allRows.length})`;
    }
    return `(${visibleRows.length}/${allRows.length})`;
  }, [state.kind, visibleRows.length, allRows.length]);

  const assignmentName = state.kind === 'ready' ? state.assignment?.assignmentName : undefined;

  const columnDefinitions = useMemo(
    () => buildTeamColumns(navigate, handleFilterStatus),
    [navigate, handleFilterStatus],
  );

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
            <SpaceBetween direction="horizontal" size="xs">
              <Button iconName="refresh" ariaLabel="Tải lại danh sách nhóm" onClick={reload}>
                Tải lại
              </Button>
              <Button
                variant="primary"
                disabled={eligibleSelectedRows.length === 0 || batchGrading}
                loading={batchGrading}
                onClick={handleBatchGrade}
              >
                {eligibleSelectedRows.length > 0
                  ? `Chấm các nhóm đã chọn (${eligibleSelectedRows.length})`
                  : 'Chấm các nhóm đã chọn'}
              </Button>
            </SpaceBetween>
          }
        >
          Danh sách nhóm
        </Header>
      }
    >
      <SpaceBetween size="m">
        {batchNotice !== undefined && (
          <Alert type="success" dismissible onDismiss={() => setBatchNotice(undefined)}>
            {batchNotice}
          </Alert>
        )}
        {batchError !== undefined && (
          <Alert
            type="error"
            header="Chấm bài hàng loạt có lỗi"
            dismissible
            onDismiss={() => setBatchError(undefined)}
          >
            {batchError}
          </Alert>
        )}
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
          items={sortedRows}
          loading={state.kind === 'loading'}
          loadingText="Đang tải danh sách nhóm..."
          variant="container"
          trackBy={(row) => row.team.teamId}
          selectionType="multi"
          selectedItems={selectedRows}
          onSelectionChange={({ detail }) => setSelectedRows(detail.selectedItems)}
          isItemDisabled={(row) =>
            row.team.status !== 'SUBMITTED' || row.gradingStatus === 'IN_PROGRESS'
          }
          sortingColumn={sortingColumn}
          sortingDescending={isDescending}
          onSortingChange={({ detail }) => {
            setSortingColumn(detail.sortingColumn);
            setIsDescending(detail.isDescending ?? false);
          }}
          header={<Header counter={counterText}>Nhóm</Header>}
          filter={
            <Select
              selectedOption={selectedFilter}
              options={FILTER_OPTIONS}
              ariaLabel="Lọc theo trạng thái chấm bài"
              onChange={({ detail }) => setSelectedFilter(detail.selectedOption)}
            />
          }
          columnDefinitions={columnDefinitions}
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
