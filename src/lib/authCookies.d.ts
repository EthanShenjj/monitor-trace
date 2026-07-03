export const SESSION_COOKIE_NAME: "monitor_session";
export const sessionCookieOptions: {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
};
