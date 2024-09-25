#!/usr/bin/env node

import 'db'; // Make sure the database connection gets setup
import { Package } from 'db/package';
import { type IPackage } from 'db/package/types';
import { type FilterQuery } from 'mongoose';

const query: FilterQuery<IPackage> = {};
if (process.argv[2]) {
  query.id = process.argv[2];
}

Package.find(query).then(async (pkgs) => {
  const pLimit = await import('p-limit');
  const limit = pLimit.default(10);

  return await Promise.all(pkgs.map((pkg) => {
    return limit(async () => {
      console.log(pkg.id);
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
