/**
 * Chuẩn hoá tên nhóm. Giống mock (`trim().toLowerCase()`) + thêm NFC để cùng
 * 1 tên gõ bằng bộ gõ khác nhau (dựng sẵn / tổ hợp) không thành 2 nhóm.
 */
export function cleanTeamName(name: string): string {
  return name.normalize('NFC').trim();
}

export function normalizeTeamName(name: string): string {
  return cleanTeamName(name).toLowerCase();
}
