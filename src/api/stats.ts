import express, { type Request, type Response } from 'express';
import { success } from 'utils';
import { Package } from 'db/package';

const router = express.Router();

/**
 * Return various stats about apps in the store
 */
router.get('/', async (req: Request, res: Response) => { success(res, await Package.stats()); });

export default router;
