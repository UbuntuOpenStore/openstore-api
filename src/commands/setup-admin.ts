#!/usr/bin/env node

import 'db'; // Make sure the database connection gets setup
import User from 'db/user/model';

User.findOne({}).then((user) => {
  if (!user) {
    throw new Error('user not found');
  }

  // eslint-disable-next-line no-param-reassign
  user.role = 'admin';
  return user.save();
}).then((user) => {
  console.log(user.name);
  process.exit(0);
}).catch((err) => {
  console.log(err);
  process.exit(1);
});
