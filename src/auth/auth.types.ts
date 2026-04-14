export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}
