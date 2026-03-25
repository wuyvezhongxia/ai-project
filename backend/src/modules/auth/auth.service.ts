import { prisma } from "../../common/prisma";

function pickJwtAvatar(payload: { avatar?: unknown; avatar_url?: unknown }): string | undefined {
  const a = payload.avatar;
  const b = payload.avatar_url;
  if (typeof a === "string" && a.trim()) return a.trim();
  if (typeof b === "string" && b.trim()) return b.trim();
  return undefined;
}

export function resolveAvatarUrl(jwtPayload: { avatar?: unknown; avatar_url?: unknown }): string | null {
  const fromJwt = pickJwtAvatar(jwtPayload);
  if (fromJwt) return fromJwt;
  return null;
}

export async function loadRoleNamesForUser(userId: bigint, tenantId: string): Promise<string[]> {
  const links = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });
  if (!links.length) return [];
  const roleIds = links.map((l) => l.roleId);
  // Scope role lookup by tenant because sys_role ids are not globally unique in this project.
  const roles = await prisma.role.findMany({
    where: { roleId: { in: roleIds }, tenantId },
    select: { roleName: true, roleKey: true, delFlag: true },
  });
  const active = roles.filter((r) => r.delFlag == null || r.delFlag === "0");
  const names = active
    .map((r) => (r.roleName?.trim() ? r.roleName.trim() : r.roleKey?.trim() || ""))
    .filter(Boolean);
  return [...new Set(names)];
}
