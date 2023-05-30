/* eslint-disable no-restricted-syntax */
import fs from 'fs';
import path from 'path';

import 'db'; // Make sure the database connection gets setup
import { Architecture, Channel } from 'db/package/types';
import { Package } from 'db/package';
import { config } from 'utils';
import limitedApps from './limited-apps.json';

const MAX_REVISIONS = 3;
const MIN_FILES_CHECK = 20;

const architectures = Object.values(Architecture);
const channels = Object.values(Channel);
const keys: string[] = [];
for (const arch of architectures) {
  for (const channel of channels) {
    keys.push(`${channel}-${arch}`);
  }
}

Package.find({ id: { $in: limitedApps } }).then((pkgs) => {
  return Promise.all(pkgs.map((pkg) => {
    if (pkg.revisions) {
      const fileCounts = keys.reduce<{ [key: string]: number }>((acc, current) => {
        return { ...acc, [current]: 0 };
      }, {});

      const keepFiles: string[] = [];
      for (let i = (pkg.revisions.length - 1); i >= 0; i--) {
        const revision = pkg.revisions[i];
        const key = `${revision.channel}-${revision.architecture}`;
        if (revision.download_url) {
          fileCounts[key]++;
          if (fileCounts[key] > MAX_REVISIONS) {
            console.log(`[${pkg.id as string}] removing ${revision.download_url}`);

            try {
              fs.unlinkSync(revision.download_url);
            }
            catch (err) {
              if (err.message.includes('no such file or directory')) {
                console.log(err.message);
              }
              else {
                throw err;
              }
            }
            revision.download_url = null;
          }
          else if (fs.existsSync(revision.download_url)) {
            keepFiles.push(revision.download_url);
          }
          else {
            console.log(`[${pkg.id as string}] missing ${revision.download_url}`);
            revision.download_url = null;
          }
        }
      }

      console.log(`[${pkg.id as string}] keeping ${keepFiles.length} clicks`);

      const allFiles = fs.readdirSync(config.data_dir);
      const extraFiles = allFiles.filter((file) => {
        const fullFile = path.join(config.data_dir, file);

        // TODO make a script to update everything to the new path
        // /srv/openstore-data is a symlink to /srv/data/openstore-data
        return file.startsWith(`${pkg.id as string}`) &&
          !keepFiles.includes(fullFile) &&
          !keepFiles.includes(fullFile.replace('/data/', '/'));
      });

      for (let i = 0; i < extraFiles.length; i++) {
        const file = path.join(config.data_dir, extraFiles[i]);
        console.log(`[${pkg.id as string}] removing extra file ${file}`);
        fs.unlinkSync(file);
      }

      pkg.updateCalculatedProperties();
      return pkg.save();
    }

    return pkg;
  }));
}).then(() => {
  console.log('done removing old revisions');

  const allFiles = fs.readdirSync(config.data_dir);
  const counts = allFiles.map((file) => {
    return file.split('-xenial')[0];
  }).reduce<{ [key: string]: number }>((acc, curr) => {
    if (!acc[curr]) {
      acc[curr] = 0;
    }

    acc[curr] += 1;

    return acc;
  }, {});

  console.log(`packages with ${MIN_FILES_CHECK} or more files`);
  Object.keys(counts).filter((key) => {
    return counts[key] >= MIN_FILES_CHECK;
  }).forEach((key) => {
    console.log(key, counts[key]);
  });

  process.exit(0);
}).catch((err) => {
  console.log(err);
  process.exit(1);
});
