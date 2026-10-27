/** Admins are the addresses listed in ADMIN_EMAILS (comma separated). With the variable unset, nobody is an admin. */
export function isAdminEmail(email: string | null | undefined, list: string | undefined): boolean {
  if (!email || !list) return false;
  const wanted = email.trim().toLowerCase();
  return list
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(wanted);
}
