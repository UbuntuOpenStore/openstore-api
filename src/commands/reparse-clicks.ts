#!/usr/bin/env node

import fs from 'fs';
import pLimit from 'p-limit';

import 'db'; // Make sure the database connection gets setup
import { Package } from 'db/package';
import * as clickParser from 'utils/click-parser-async';
import { PackageDoc, RevisionDoc } from 'db/package/types';
import { FilterQuery } from 'mongoose';

const limit = pLimit(10);

const query: FilterQuery<PackageDoc> = {};
if (process.argv[2]) {
  query.id = process.argv[2];
}

Package.find(query).then((pkgs) => {
  return Promise.all(pkgs.map((pkg) => {
    return limit(async() => {
      let revisionData: RevisionDoc | undefined;
      pkg.revisions.forEach((data) => {
        if (!revisionData || revisionData.revision < data.revision) {
          revisionData = data;
        }
      });

      if (revisionData && revisionData.download_url && fs.existsSync(revisionData.download_url)) {
        console.log(`Parsing ${pkg.id}`);

        const parseData = await clickParser.parseClickPackage(revisionData.download_url, false);
        pkg.updateFromClick(parseData);

        console.log(`Saving ${pkg.id}`);
        return pkg.save();
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
