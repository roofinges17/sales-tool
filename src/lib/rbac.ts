export type UserRole = "owner" | "admin" | "manager" | "seller";

// Maximum discount percentage sellers may apply without manager approval
export const SELLER_DISCOUNT_CAP_PCT = 10;

const ROLE_RANK: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  seller: 1,
};

// Returns true if the user's role is at least minRole in the hierarchy
export function atLeast(
  userRole: string | null | undefined,
  minRole: UserRole,
): boolean {
  return (ROLE_RANK[userRole as UserRole] ?? 0) >= ROLE_RANK[minRole];
}
