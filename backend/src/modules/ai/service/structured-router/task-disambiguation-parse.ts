import { cleanQuotedText } from "../../core/ai.text-utils";

export type DisambiguationParseResult =
  | { kind: "pick"; id: string }
  | { kind: "batch_delete" }
  | { kind: "cancel" };

const CN_NUM: Record<string, number> = {
  一: 0,
  二: 1,
  三: 2,
  四: 3,
  五: 4,
  六: 5,
  七: 6,
  八: 7,
  九: 8,
  十: 9,
};

function norm(s: string): string {
  return cleanQuotedText(s).trim().toLowerCase();
}

/**
 * 解析用户对「候选任务列表」的回复：序号、第 N 个、完整标题、批量删除、取消。
 */
export function parseTaskDisambiguationReply(
  question: string,
  candidates: Array<{ id: string; taskName: string }>,
): DisambiguationParseResult | null {
  const q = question.trim();
  const compact = q.replace(/\s+/g, "");

  if (/^(取消|算了|不要了|先不要|不用)/.test(q)) {
    return { kind: "cancel" };
  }

  if (/^(都删除|全部删除|全删|通通删除)/.test(compact)) {
    return { kind: "batch_delete" };
  }

  const digitOrdinal = q.match(/^第\s*(\d{1,2})\s*[、.)\]）]?\s*(个|条)?/);
  if (digitOrdinal) {
    const idx = parseInt(digitOrdinal[1]!, 10) - 1;
    if (idx >= 0 && idx < candidates.length) {
      return { kind: "pick", id: candidates[idx]!.id };
    }
    return null;
  }

  if (/^第?[一二三四五六七八九十]\s*(个|条)?$/.test(compact) || /^第[一二三四五六七八九十]/.test(compact)) {
    const m = compact.match(/第?([一二三四五六七八九十])/);
    if (m) {
      const idx = CN_NUM[m[1]!];
      if (idx !== undefined && idx < candidates.length) {
        return { kind: "pick", id: candidates[idx]!.id };
      }
    }
  }

  const leadNum = q.match(/^\s*(\d{1,2})\s*[、.)\]）]?\s*$/);
  if (leadNum) {
    const idx = parseInt(leadNum[1]!, 10) - 1;
    if (idx >= 0 && idx < candidates.length) {
      return { kind: "pick", id: candidates[idx]!.id };
    }
  }

  const nq = norm(q);
  if (!nq) return null;

  for (const c of candidates) {
    const nt = norm(c.taskName);
    if (nt && nq === nt) return { kind: "pick", id: c.id };
  }
  for (const c of candidates) {
    const nt = norm(c.taskName);
    if (nt && (nq.includes(nt) || nt.includes(nq)) && nt.length >= 2) {
      return { kind: "pick", id: c.id };
    }
  }

  return null;
}
