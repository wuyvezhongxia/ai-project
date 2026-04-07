import { z } from "zod";

/** 传入 Skill.execute 的用户侧文案（与 chat input 上限对齐） */
export const skillUserInputSchema = z.string().trim().min(1, "input 不能为空").max(5000);
