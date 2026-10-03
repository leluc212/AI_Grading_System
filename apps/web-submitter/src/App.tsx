/**
 * Root component + bảng route của app `web-submitter` (task 5.1).
 *
 * Bảng route (theo design.md > Components and Interfaces > web-submitter):
 *   - `/`                      -> `SelectAssignmentPage` (task 5.2)
 *   - `/submit/:assignmentId`  -> `SubmitFormPage`        (task 5.5)
 *   - `/submit-success`        -> `SubmitSuccessPage`     (task 5.6)
 *   - `*`                      -> redirect về `/` (URL lạ không để trắng trang)
 *
 * Quy ước đặt tên route "thành công": chọn `/submit-success` (khớp tên
 * component `SubmitSuccessPage` trong design.md) — task 5.6 dùng đúng path
 * này khi điều hướng sau khi API trả OK.
 *
 * Shell layout: app nộp bài là trang PUBLIC cho sinh viên, chỉ có 1 luồng
 * tuyến tính nên KHÔNG dùng `AppLayout`/`SideNavigation` của Cloudscape
 * (phần đó thuộc app Admin — task 6.1). Ở đây chỉ cần `ContentLayout` +
 * `Header` h1 canh giữa, các page tự render `Container` với header h2 để giữ
 * đúng cấu trúc heading (h1 -> h2) cho screen reader.
 */
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import type { CSSProperties } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { SelectAssignmentPage } from './pages/SelectAssignmentPage';
import { SubmitFormPage } from './pages/SubmitFormPage';
import { SubmitSuccessPage } from './pages/SubmitSuccessPage';

/** Giới hạn bề rộng nội dung và canh giữa — luồng nộp bài chỉ có 1 cột. */
const shellStyle: CSSProperties = {
  maxWidth: 960,
  margin: '0 auto',
  padding: '24px 16px',
};

export function App() {
  return (
    <main style={shellStyle}>
      <ContentLayout
        header={
          <Header variant="h1" description="Nộp bài tập nhóm cho môn học">
            Quick Grading
          </Header>
        }
      >
        <Routes>
          <Route path="/" element={<SelectAssignmentPage />} />
          <Route path="/submit/:assignmentId" element={<SubmitFormPage />} />
          <Route path="/submit-success" element={<SubmitSuccessPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ContentLayout>
    </main>
  );
}
