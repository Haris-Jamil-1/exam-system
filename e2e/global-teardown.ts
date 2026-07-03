export default async function globalTeardown() {
  // Intentionally a no-op: teardown is invoked as a separate explicit step
  // (`npm run test:e2e:teardown`) rather than automatically after every run,
  // so a failed run's data can be inspected before cleanup. See tests/README.md.
}
