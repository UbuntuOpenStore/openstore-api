import express, { type Request, type Response } from 'express';

import { User } from 'db/user';
import { success, asyncErrorWrapper } from 'utils';
import { authenticate, adminOnly } from 'middleware';
import { NotFoundError } from 'exceptions';
import { USER_NOT_FOUND } from '../utils/error-messages';

const router = express.Router();

router.get('/', authenticate, adminOnly, asyncErrorWrapper(async (req: Request, res: Response) => {
  const users = await User.find({});
  success(res, users.map((user) => user.serialize()));
}, 'Could not fetch user list at this time'));

router.get('/me', authenticate, adminOnly, asyncErrorWrapper(async (req: Request, res: Response) => {
  if (req.user) {
    success(res, req.user.serialize());
  }
  else {
    res.status(401);
    res.send({
      success: false,
      data: null,
      message: 'User not logged in',
    });
  }
}, 'Could not fetch user at this time'));

router.get('/:id', authenticate, adminOnly, asyncErrorWrapper(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError(USER_NOT_FOUND);
  }

  success(res, user.serialize());
}, 'Could not fetch user at this time'));

router.put('/:id', authenticate, adminOnly, asyncErrorWrapper(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError(USER_NOT_FOUND);
  }

  user.role = req.body.role;
  await user.save();

  success(res, user.serialize());
}, 'Could not update user at this time'));

export default router;
