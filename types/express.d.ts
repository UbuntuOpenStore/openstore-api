import { type HydratedPackage } from '../src/db/package';
import { type HydratedUser } from '../src/db/user';

declare global {
  namespace Express {
    interface Request {
      apiVersion?: number;
      user?: HydratedUser;
      pkg: HydratedPackage;
      isAuthenticated(): boolean;
      logout(): void;
      isTrustedUser?: boolean;
      isAdminUser?: boolean;
      files?: {
        file?: {
          originalname: string;
          path: string;
          size: number;
        }[];
        screenshot_files?: {
          originalname: string;
          path: string;
          size: number;
        }[];
      };
      file?: {
        originalname: string;
        path: string;
        size: number;
      };
    }

    interface Response {
    }

    interface User extends HydratedUser {}
  }
}
