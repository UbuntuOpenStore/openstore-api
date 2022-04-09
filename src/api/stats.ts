import express, { Request, Response } from 'express';
import { success } from 'utils';
import { Package } from 'db/package';

const router = express.Router();

router.get('/', async(req: Request, res: Response) => success(res, await Package.stats()));

export default router;
