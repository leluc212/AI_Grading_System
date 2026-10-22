/**
 * Service layer cho domain GradingConfig (`gradingConfigApi`).
 *
 * Cho phép xem và lưu cấu hình chấm điểm:
 *   - mode: 'RUBRIC' | 'PROMPT' | 'HYBRID'
 *   - systemPrompt: string (lời nhắc chấm điểm tùy chỉnh)
 *   - model, reasoningEffort, maxInputTokens, maxOutputTokens, autoGradeOnSubmit
 *
 * Ánh xạ hàm -> endpoint:
 *   - getActiveGradingConfig()      -> GET  /api/grading-config/active
 *   - listGradingConfigVersions()   -> GET  /api/grading-config
 *   - saveGradingConfig(input)      -> POST /api/grading-config
 */
import type { GradingConfig, GradingMode } from '@quick-grading/shared-types';
import { apiFetch, apiFetchJson } from './http.js';

export interface CreateGradingConfigInput {
  mode: GradingMode;
  systemPrompt?: string;
  model?: string;
  reasoningEffort?: 'low' | 'medium';
  maxInputTokens?: number;
  maxOutputTokens?: number;
  autoGradeOnSubmit?: boolean;
}

export const gradingConfigApi = {
  /**
   * Lấy cấu hình chấm điểm đang active (dùng cho các lượt chấm mới).
   * Trả về `GradingConfig | null`.
   */
  getActiveGradingConfig(): Promise<GradingConfig | null> {
    return apiFetch<GradingConfig | null>('/api/grading-config/active');
  },

  /**
   * Liệt kê danh sách toàn bộ các phiên bản cấu hình chấm điểm (sort tăng dần theo version).
   */
  listGradingConfigVersions(): Promise<GradingConfig[]> {
    return apiFetch<GradingConfig[]>('/api/grading-config');
  },

  /**
   * Tạo một phiên bản cấu hình chấm điểm mới và kích hoạt.
   * Bản cũ sẽ tự động được lưu trữ và đánh dấu isActive = false.
   */
  saveGradingConfig(input: CreateGradingConfigInput): Promise<GradingConfig> {
    return apiFetchJson<GradingConfig>('/api/grading-config', 'POST', input);
  },
};
