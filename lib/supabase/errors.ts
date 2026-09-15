// PostgREST / Postgres error codes that mean "that migration hasn't been
// applied yet". Features that ship ahead of their migration check for these and
// switch themselves off, instead of failing the whole page.

type DbError = { code?: string; message?: string } | null | undefined;

/** "That table or view doesn't exist." */
export function isMissingTable(error: DbError): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

/** "That column doesn't exist." */
export function isMissingColumn(error: DbError): boolean {
  return error?.code === "PGRST204" || error?.code === "42703";
}

/** "That function doesn't exist." */
export function isMissingFunction(error: DbError): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}
