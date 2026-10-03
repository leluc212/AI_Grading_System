/**
 * Entry point của `@quick-grading/api-client` — service layer dùng chung
 * cho `web-submitter` và `web-admin` (design.md > API Contract offer "1
 * package `api-client` dùng chung").
 *
 * Mỗi domain expose 1 object namespaced (`assignmentsApi.listAssignments()`,
 * `teamsApi.getTeam()`, ...). Task 4.1 hiện thực `assignmentsApi` +
 * `teamsApi`; task 4.2 bổ sung `gradingApi`, `rubricsApi`, `exportApi`,
 * `authApi`.
 */
export * from './http.js';
export * from './assignmentsApi.js';
export * from './teamsApi.js';
export * from './gradingApi.js';
export * from './rubricsApi.js';
export * from './exportApi.js';
export * from './authApi.js';
