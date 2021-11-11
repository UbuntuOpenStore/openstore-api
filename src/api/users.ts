import express, { Request, Response } from 'express';

import UserRepo from 'db/user/repo';
import { serialize } from 'db/user/serializer';
import { error, success, captureException } from 'utils/helpers';
import { authenticate, adminOnly } from 'utils/middleware';

const router = express.Router();
const USER_NOT_FOUND = 'User not found';

router.get('/', authenticate, adminOnly, async(req: Request, res: Response) => {
  try {
    const users = await UserRepo.find();
    return success(res, serialize(users));
  }
  catch (err) {
    captureException(err, req.originalUrl);
    return error(res, err);
  }
});

router.get('/:id', authenticate, adminOnly, async(req: Request, res: Response) => {
  try {
    const user = await UserRepo.findOne(req.params.id);
    if (!user) {
      return error(res, USER_NOT_FOUND, 404);
    }

    return success(res, serialize(user));
  }
  catch (err) {
    captureException(err, req.originalUrl);
    return error(res, err);
  }
});

router.put('/:id', authenticate, adminOnly, async(req: Request, res: Response) => {
  try {
    const user = await UserRepo.findOne(req.params.id);
    if (!user) {
      return error(res, USER_NOT_FOUND, 404);
    }

    user.role = req.body.role;
    await user.save();

    return success(res, serialize(user));
  }
  catch (err) {
    return error(res, err);
  }
});

export default router;
