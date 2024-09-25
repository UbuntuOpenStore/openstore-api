#!/usr/bin/env node

import fs from 'fs';

import 'db'; // Make sure the database connection gets setup
import { type HydratedRevision, type IPackage, Package } from 'db/package';
import * as clickParser from 'utils/click-parser-async';
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
      let revisionData: HydratedRevision | undefined;
      pkg.revisions.forEach((data) => {
        if (!revisionData || revisionData.revision < data.revision) {
          revisionData = data;
        }
      });

      if (revisionData && revisionData.download_url && fs.existsSync(revisionData.download_url)) {
        console.log('Parsing', pkg.id);

        const parseData = await clickParser.parseClickPackage(revisionData.download_url, false);
        pkg.updateFromClick(parseData);

        console.log('Saving', pkg.id);
        return await pkg.save();
      }

      return pkg;
    });
  }));
}).then(() => {
  console.log('done');
  process.exit(0);
}).catch((err) => {
  console.log(err);
  process.exit(1);
});
