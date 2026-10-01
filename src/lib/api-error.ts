/** Dependency-free error type so domain modules (and tests) need not import Next.js helpers. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
