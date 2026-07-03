type PublicUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export function createAuthStore(options: {
  dbPath?: string;
  filePath?: string;
  sessionSecret: string;
}): {
  registerUser(input: { name: string; email: string; password: string }): Promise<PublicUser>;
  authenticateUser(email: string, password: string): Promise<PublicUser>;
  getUserById(userId: string): Promise<PublicUser | null>;
  createSessionToken(userId: string): string;
  verifySessionToken(token?: string): { userId: string; iat: number; exp: number } | null;
};

export function getDefaultAuthStore(): ReturnType<typeof createAuthStore>;
export const authStore: ReturnType<typeof createAuthStore>;
