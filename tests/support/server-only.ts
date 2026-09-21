/**
 * Stands in for the `server-only` package under Vitest.
 *
 * `server-only` throws unless it is resolved under React's server export
 * condition, which the test runner does not use. Aliasing it here lets server
 * modules be tested directly; the real guarantee is unaffected, because Next.js
 * still resolves the real package and fails the BUILD if a client component
 * imports a server module.
 */
export {};
