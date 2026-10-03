/**
 * Trang chi tiết nhóm — trung tâm mọi thao tác trên 1 nhóm.
 *
 * Gộp các task:
 *   - 8.2: thông tin thành viên + `FileViewer` (Requirement 5.3, 5.4)
 *   - 8.3: `GradingHistoryList` (Requirement 6.6)
 *   - 9.1/9.2: `GradingPanel` — trigger chấm bài, hiển thị kết quả/lỗi
 *   - 9.3: `ReviewPanel` — review lượt chấm cần xem lại
 *   - 9.4: nút "Mở khoá nộp lại"
 *
 * Trang này gom toàn bộ vì Requirement 7.2 đòi hỏi khi review, Admin thấy
 * ĐỒNG THỜI nội dung 2 file và điểm/feedback của AI — tách thành nhiều trang
 * sẽ phá yêu cầu đó.
 *
 * ## Vì sao phải poll
 *
 * `triggerGrading` trả về ngay với trạng thái `IN_PROGRESS` (HTTP 202) và việc
 * chấm hoàn tất OUT-OF-BAND sau ~1.5-2s (xem `mock-server/handlers/grading.ts`).
 * Giai đoạn 1 không có WebSocket/SSE nào đẩy kết quả về, nên trang tự đọc lại
 * lịch sử chấm theo chu kỳ cho tới khi lượt gần nhất rời khỏi `IN_PROGRESS`.
 * Có giới hạn số lần poll: nếu lượt chấm treo, trang ngừng tự cập nhật và nói
 * rõ với Admin thay vì gọi API vô hạn.
 *
 * ## Vì sao tách lỗi theo từng khối
 *
 * Chỉ `getTeam` thất bại mới coi là cả trang lỗi. Nội dung file và lịch sử chấm
 * có thể thất bại một cách BÌNH THƯỜNG (nhóm chưa nộp đủ file; blob URL đã bị
 * revoke sau khi refresh — hạn chế đã biết của giai đoạn 1), nên hỏng thì chỉ
 * hiện cảnh báo trong đúng khối của nó.
 *
 * _Requirements: 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.1, 7.2, 8.1, 8.2_
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { GradingResult, Team } from '@quick-grading/shared-types';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import Table from '@cloudscape-design/components/table';
import { FileViewer } from '../components/FileViewer';
import { GradingHistoryList } from '../components/GradingHistoryList';
import { GradingPanel } from '../components/GradingPanel';
import { ReviewPanel } from '../components/ReviewPanel';
import { TeamStatusBadge } from '../components/StatusBadge';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { gradingApi, teamsApi } from '../services';
import { toDisplayMessage } from '../errorMessage';
import { formatDateTime } from '../format';
import { deriveGradingStatus } from '../gradingStatus';

interface TeamFiles {
  md: string;
  xml: string;
}

type TeamState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      team: Team;
      /** `null` nếu không đọc được nội dung file; lý do nằm ở `filesError`. */
      files: TeamFiles | null;
      filesError?: string;
    };

/** Chu kỳ đọc lại lịch sử chấm khi đang có lượt chạy. */
const POLL_INTERVAL_MS = 1500;

/**
 * Số lần poll tối đa (~30s với chu kỳ 1.5s). Mock hoàn tất sau ~2s, nên vượt
 * ngưỡng này nghĩa là có gì đó không ổn — ngừng poll để không gọi API vô hạn.
 */
const MAX_POLL_ATTEMPTS = 20;

export function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { admin } = useAdminAuth();
  // Trang này nằm trong `RequireAdminAuth` nên `admin` luôn khác null; fallback
  // chỉ để type-safe.
  const adminUsername = admin?.username ?? '';

  const [teamState, setTeamState] = useState<TeamState>({ kind: 'loading' });
  const [history, setHistory] = useState<GradingResult[]>([]);
  const [historyError, setHistoryError] = useState<string | undefined>(undefined);
  const [reloadToken, setReloadToken] = useState(0);

  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | undefined>(undefined);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  const [unlocking, setUnlocking] = useState(false);
  const [unlockNotice, setUnlockNotice] = useState<string | undefined>(undefined);
  const [unlockError, setUnlockError] = useState<string | undefined>(undefined);

  /**
   * Đọc lại lịch sử chấm (không đụng tới team/file).
   *
   * Tách riêng vì được gọi ở 3 chỗ: sau khi trigger, trong vòng poll, và sau
   * khi review — cả 3 đều không cần tải lại nội dung file (vốn nặng hơn).
   */
  const refreshHistory = useCallback(async () => {
    if (teamId === undefined) {
      return;
    }
    try {
      const next = await gradingApi.listGradingHistory(teamId);
      setHistory(next);
      setHistoryError(undefined);
    } catch (error: unknown) {
      console.error('[TeamDetailPage] Không đọc được lịch sử chấm:', error);
      setHistoryError(toDisplayMessage(error, 'Không đọc được lịch sử chấm bài.'));
    }
  }, [teamId]);

  useEffect(() => {
    let cancelled = false;

    if (teamId === undefined || teamId.trim().length === 0) {
      setTeamState({ kind: 'error', message: 'Thiếu mã nhóm trong đường dẫn.' });
      return;
    }

    setTeamState({ kind: 'loading' });

    async function load(id: string): Promise<void> {
      // Thất bại ở đây = cả trang không có gì để hiện -> để lỗi lan ra ngoài.
      const team = await teamsApi.getTeam(id);

      const [filesResult, historyResult] = await Promise.all([
        teamsApi
          .getTeamFiles(id)
          .then((files) => ({ files, error: undefined as string | undefined }))
          .catch((error: unknown) => {
            console.error('[TeamDetailPage] Không đọc được nội dung file:', error);
            return {
              files: null,
              error: toDisplayMessage(error, 'Không đọc được nội dung file bài làm.'),
            };
          }),
        gradingApi
          .listGradingHistory(id)
          .then((list) => ({ list, error: undefined as string | undefined }))
          .catch((error: unknown) => {
            console.error('[TeamDetailPage] Không đọc được lịch sử chấm:', error);
            return {
              list: [] as GradingResult[],
              error: toDisplayMessage(error, 'Không đọc được lịch sử chấm bài.'),
            };
          }),
      ]);

      if (cancelled) {
        return;
      }

      setTeamState({
        kind: 'ready',
        team,
        files: filesResult.files,
        filesError: filesResult.error,
      });
      setHistory(historyResult.list);
      setHistoryError(historyResult.error);
    }

    load(teamId).catch((error: unknown) => {
      if (cancelled) {
        return;
      }
      console.error('[TeamDetailPage] Không tải được thông tin nhóm:', error);
      setTeamState({
        kind: 'error',
        message: toDisplayMessage(error, 'Không tải được thông tin nhóm. Vui lòng thử lại.'),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [teamId, reloadToken]);

  const reload = useCallback(() => {
    setTriggerError(undefined);
    setUnlockError(undefined);
    setUnlockNotice(undefined);
    setReloadToken((token) => token + 1);
  }, []);

  // Mảng lịch sử theo thứ tự thời gian tăng dần -> phần tử cuối là lượt gần nhất.
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const isGrading =
    latest !== null && (latest.status === 'IN_PROGRESS' || latest.status === 'PENDING');

  /** Poll lịch sử chấm khi đang có lượt chạy (xem JSDoc đầu file). */
  useEffect(() => {
    if (!isGrading) {
      setPollTimedOut(false);
      return;
    }

    let attempts = 0;
    const intervalId = setInterval(() => {
      attempts += 1;
      if (attempts > MAX_POLL_ATTEMPTS) {
        clearInterval(intervalId);
        setPollTimedOut(true);
        return;
      }
      void refreshHistory();
    }, POLL_INTERVAL_MS);

    // Dọn interval khi rời trang hoặc khi lượt chấm đã xong — thiếu bước này
    // sẽ để lại timer gọi API mãi sau khi component unmount.
    return () => {
      clearInterval(intervalId);
    };
  }, [isGrading, refreshHistory]);

  /** Requirement 6.1, 6.2, 6.3: bắt đầu 1 lượt chấm mới. */
  const handleTrigger = useCallback(async () => {
    if (teamId === undefined) {
      return;
    }
    setTriggerError(undefined);
    setTriggering(true);
    try {
      await gradingApi.triggerGrading(teamId, adminUsername);
      // Đọc lại ngay để thấy lượt `IN_PROGRESS` vừa tạo — chính việc đó bật
      // vòng poll ở trên.
      await refreshHistory();
    } catch (error: unknown) {
      console.error('[TeamDetailPage] Không bắt đầu được lượt chấm:', error);
      // `GradingInProgressError` đã có câu "Nhóm này đang được chấm bài..."
      // (Requirement 6.3) -> hiển thị nguyên văn.
      setTriggerError(toDisplayMessage(error, 'Không bắt đầu được lượt chấm. Vui lòng thử lại.'));
    } finally {
      setTriggering(false);
    }
  }, [adminUsername, refreshHistory, teamId]);

  /** Requirement 8.1, 8.2: mở khoá cho nhóm nộp lại. */
  const handleUnlock = useCallback(async () => {
    if (teamId === undefined) {
      return;
    }
    setUnlockError(undefined);
    setUnlockNotice(undefined);
    setUnlocking(true);
    try {
      const updated = await teamsApi.unlockResubmission(teamId, adminUsername);
      // Dùng luôn Team server trả về thay vì tải lại cả trang: trạng thái mới
      // nằm sẵn trong response, tải lại chỉ thêm 3 request mà không thêm thông tin.
      setTeamState((previous) =>
        previous.kind === 'ready' ? { ...previous, team: updated } : previous,
      );
      setUnlockNotice(
        'Đã mở khoá nộp lại. Nhóm có thể nộp lại 2 file mới; trạng thái sẽ trở về "Đã nộp" sau khi nộp xong.',
      );
    } catch (error: unknown) {
      console.error('[TeamDetailPage] Mở khoá nộp lại thất bại:', error);
      setUnlockError(toDisplayMessage(error, 'Không mở khoá được nộp lại. Vui lòng thử lại.'));
    } finally {
      setUnlocking(false);
    }
  }, [adminUsername, teamId]);

  if (teamState.kind === 'loading') {
    return (
      <ContentLayout header={<Header variant="h1">Chi tiết nhóm</Header>}>
        <Container>
          <Box textAlign="center" padding="l">
            <SpaceBetween size="s" alignItems="center">
              <Spinner size="large" />
              <Box variant="p">Đang tải thông tin nhóm...</Box>
            </SpaceBetween>
          </Box>
        </Container>
      </ContentLayout>
    );
  }

  if (teamState.kind === 'error') {
    return (
      <ContentLayout header={<Header variant="h1">Chi tiết nhóm</Header>}>
        <Alert
          type="error"
          header="Không mở được chi tiết nhóm"
          action={<Button onClick={reload}>Thử lại</Button>}
        >
          {teamState.message}
        </Alert>
      </ContentLayout>
    );
  }

  const { team, files, filesError } = teamState;
  // Requirement 6.2: chỉ nhóm đã nộp bài mới chấm được. Team `OPEN` là nhóm
  // chưa từng nộp file nào.
  const canGrade = team.status !== 'OPEN';
  // Requirement 7.1: chỉ hiện khu vực review khi lượt gần nhất thực sự cần.
  const needsReview = latest !== null && deriveGradingStatus(latest) === 'NEEDS_REVIEW';

  return (
    <ContentLayout
      header={
        <Header
          variant="h1"
          description={`Nộp lúc: ${formatDateTime(team.createdAt)}`}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                iconName="arrow-left"
                onClick={() => navigate(`/assignments/${team.assignmentId}/teams`)}
              >
                Về danh sách nhóm
              </Button>
              {/* Requirement 8.1: chỉ nhóm đang SUBMITTED mới mở khoá được, nên
                  nút chỉ xuất hiện trong đúng trạng thái đó. Server cũng kiểm
                  lại nên đây chỉ là UX. */}
              {team.status === 'SUBMITTED' && (
                <Button
                  iconName="unlocked"
                  loading={unlocking}
                  onClick={() => {
                    void handleUnlock();
                  }}
                >
                  Mở khoá nộp lại
                </Button>
              )}
              <Button iconName="refresh" ariaLabel="Tải lại chi tiết nhóm" onClick={reload}>
                Tải lại
              </Button>
            </SpaceBetween>
          }
        >
          {team.teamName}
        </Header>
      }
    >
      <SpaceBetween size="l">
        {unlockNotice !== undefined && (
          <Alert type="success" dismissible onDismiss={() => setUnlockNotice(undefined)}>
            {unlockNotice}
          </Alert>
        )}
        {unlockError !== undefined && (
          <Alert
            type="error"
            header="Không mở khoá được nộp lại"
            dismissible
            onDismiss={() => setUnlockError(undefined)}
          >
            {unlockError}
          </Alert>
        )}

        <Container
          header={
            <Header variant="h2" counter={`(${team.members.length})`}>
              Thành viên nhóm
            </Header>
          }
        >
          <SpaceBetween size="m">
            <Box>
              <Box variant="awsui-key-label">Trạng thái nộp bài</Box>
              <TeamStatusBadge status={team.status} />
            </Box>

            <Table
              items={team.members}
              trackBy="memberId"
              variant="embedded"
              columnDefinitions={[
                { id: 'memberName', header: 'Tên sinh viên', cell: (member) => member.memberName },
                { id: 'email', header: 'Email', cell: (member) => member.email },
                {
                  id: 'studentCode',
                  header: 'MSSV',
                  // MSSV là tuỳ chọn (Requirement 2.2) -> hiện gạch ngang chứ
                  // không để ô trống gây cảm giác thiếu dữ liệu.
                  cell: (member) => member.studentCode ?? '—',
                },
              ]}
              empty={<Box variant="p">Nhóm chưa có thành viên nào.</Box>}
            />
          </SpaceBetween>
        </Container>

        <Container header={<Header variant="h2">Nội dung bài làm</Header>}>
          {files !== null ? (
            <FileViewer markdownContent={files.md} xmlContent={files.xml} />
          ) : (
            <Alert type="warning" header="Không xem được nội dung bài làm">
              {filesError ?? 'Không đọc được nội dung file bài làm.'}
            </Alert>
          )}
        </Container>

        <GradingPanel
          latest={latest}
          isGrading={isGrading}
          triggering={triggering}
          canGrade={canGrade}
          triggerError={triggerError}
          pollTimedOut={pollTimedOut}
          onTrigger={() => {
            void handleTrigger();
          }}
        />

        {needsReview && latest !== null && (
          <ReviewPanel
            grading={latest}
            reviewedBy={adminUsername}
            onReviewed={() => {
              void refreshHistory();
            }}
          />
        )}

        {historyError !== undefined && (
          <Alert type="warning" header="Không đọc được lịch sử chấm bài">
            {historyError}
          </Alert>
        )}
        <GradingHistoryList history={history} />
      </SpaceBetween>
    </ContentLayout>
  );
}
