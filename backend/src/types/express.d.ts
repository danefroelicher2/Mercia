import { User } from '../services/auth';

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
