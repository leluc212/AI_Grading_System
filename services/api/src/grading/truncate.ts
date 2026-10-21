/**
 * Giới hạn và cắt ngắn input nếu vượt quá maxInputTokens (infra-plan mục 6.4).
 *
 * Ước lượng token: ceil(chars / 3) (thận trọng với XML/Markdown tiếng Việt).
 */
export interface TruncateInputParams {
  mdContent: string;
  xmlContent: string;
  maxInputTokens: number;
}

export interface TruncateResult {
  mdContent: string;
  xmlContent: string;
  truncated: boolean;
  estimatedTokens: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function truncateSubmissionFiles({
  mdContent,
  xmlContent,
  maxInputTokens,
}: TruncateInputParams): TruncateResult {
  const mdLen = mdContent.length;
  const xmlLen = xmlContent.length;
  const totalLen = mdLen + xmlLen;
  const estimatedTokens = Math.ceil(totalLen / 3);

  const maxAllowedChars = maxInputTokens * 3;

  if (totalLen <= maxAllowedChars) {
    return {
      mdContent,
      xmlContent,
      truncated: false,
      estimatedTokens,
    };
  }

  // Cần cắt bớt phần đuôi theo tỷ lệ dung lượng của từng file
  const ratioMd = mdLen / totalLen;
  const targetMdChars = Math.floor(maxAllowedChars * ratioMd);
  const targetXmlChars = maxAllowedChars - targetMdChars;

  let truncatedMd = mdContent;
  let truncatedXml = xmlContent;

  if (mdLen > targetMdChars) {
    const cutCount = mdLen - targetMdChars;
    const marker = `\n\n[...đã cắt ${cutCount} ký tự...]\n`;
    const keepChars = Math.max(0, targetMdChars - marker.length);
    truncatedMd = mdContent.slice(0, keepChars) + marker;
  }

  if (xmlLen > targetXmlChars) {
    const cutCount = xmlLen - targetXmlChars;
    const marker = `\n\n[...đã cắt ${cutCount} ký tự...]\n`;
    const keepChars = Math.max(0, targetXmlChars - marker.length);
    truncatedXml = xmlContent.slice(0, keepChars) + marker;
  }

  const finalLen = truncatedMd.length + truncatedXml.length;

  return {
    mdContent: truncatedMd,
    xmlContent: truncatedXml,
    truncated: true,
    estimatedTokens: Math.ceil(finalLen / 3),
  };
}
