#!/usr/bin/env node

import pLimit from 'p-limit';

import 'db'; // Make sure the database connection gets setup
import { Package } from 'db/package';
import { type IPackage } from 'db/package/types';
import { type FilterQuery } from 'mongoose';

const limit = pLimit(10);

const query: FilterQuery<IPackage> = {};
if (process.argv[2]) {
  query.id = process.argv[2];
}

Package.find(query).then((pkgs) => {
  return Promise.all(pkgs.map((pkg) => {
    return limit(async () => {
      console.log(`processing ${pkg.id as string}`);

      await pkg.updateFromBody({ screenshots: pkg.screenshots });
      pkg.updateCalculatedProperties();

      return await pkg.save();
    });
  }));
}).then(() => {
  console.log('done');
  process.exit(0);
}).catch((err) => {
  console.log(err);
  process.exit(1);
});
