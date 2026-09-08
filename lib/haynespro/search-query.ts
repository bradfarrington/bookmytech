// Pure — no "server-only" — because the website's search box (a client
// component) enforces the same minimum before it asks the server.

/**
 * Shortest query worth walking the tree for. Shared by the website's search
 * box, the server action behind it and the mobile route (which refuses
 * shorter ones rather than answering them); the app's book/repairs screen
 * enforces the same number client-side.
 */
export const MIN_SEARCH_QUERY_LENGTH = 3;
