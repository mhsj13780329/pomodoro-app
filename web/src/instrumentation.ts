export async function register() {
  // The sweeper needs Prisma and web-push, which only exist in the Node.js runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSweeper } = await import("@/lib/push/sweeper");
    startSweeper();
  }
}
