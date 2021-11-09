import { UserDoc } from '../src/db/user/types';

declare global {
  namespace Express {
    interface Request {
      apiVersion?: number;
      user?: UserDoc;
      isAuthenticated(): boolean;
      logout(): void;
      isTrustedUser?: boolean;
      isAdminUser?: boolean;
      files?: {
        file?: {
          originalname: string,
          path: string,
          size: number,
        }[],
        screenshot_files?: {
          originalname: string,
          path: string,
          size: number,
        }[]
      };
      file?: {
        originalname: string,
        path: string,
        size: number,
      };
    }

    interface Response {
      user?: UserDoc;
    }

    interface Application {
      server?: any;
    }
  }
}
