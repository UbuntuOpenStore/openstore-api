import express, { Request, Response } from 'express';

import { User } from 'db/user';
import { error, success, captureException } from 'utils';
import { authenticate, adminOnly } from 'middleware';
import { USER_NOT_FOUND } from '../utils/error-messages';

const router = express.Router();

router.get('/', authenticate, adminOnly, async(req: Request, res: Response) => {
  try {
    const users = await User.find({});
    return success(res, users.map((user) => user.serialize()));
  }
  catch (err) {
    captureException(err, req.originalUrl);
    return error(res, err);
  }
});

router.get('/:id', authenticate, adminOnly, async(req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return error(res, USER_NOT_FOUND, 404);
    }

    return success(res, user.serialize());
  }
  catch (err) {
    captureException(err, req.originalUrl);
    return error(res, err);
  }
});

router.put('/:id', authenticate, adminOnly, async(req: Request, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return error(res, USER_NOT_FOUND, 404);
    }

    user.role = req.body.role;
    await user.save();

    return success(res, user.serialize());
  }
  catch (err) {
    return error(res, err);
  }
});

export default router;
