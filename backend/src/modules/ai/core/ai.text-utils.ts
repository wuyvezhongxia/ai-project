export const cleanQuotedText = (value: string) =>
  value
    .trim()
    .replace(/^[“”"'`《》\s]+/, "")
    .replace(/[“”"'`《》\s]+$/, "")
    .replace(/[。！!？?]+$/g, "")
    .trim();

export const normalizeLooseText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\s\-_/\\.,，。:：;；"'`“”‘’【】\[\]()（）<>《》]/g, "")
    .trim();

export const levenshteinDistance = (a: string, b: string) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0]![j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
};

export const normalizeTaskTitle = (raw: string) =>
  raw
    .trim()
    .replace(/[“”"'`《》]/g, "")
    .replace(/[。！!？?]+$/g, "")
    .trim();
