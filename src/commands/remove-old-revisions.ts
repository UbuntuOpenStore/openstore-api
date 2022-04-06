import fs from 'fs';
import path from 'path';

import 'db'; // Make sure the database connection gets setup
import { Architecture } from 'db/package/types';
import { Package } from 'db/package';
import { config } from 'utils';
import limitedApps from './limited-apps.json';

const MAX_REVISIONS = 3;
const MIN_FILES_CHECK = 20;

Package.find({ id: { $in: limitedApps } }).then((pkgs) => {
  return Promise.all(pkgs.map((pkg) => {
    if (pkg.revisions) {
      const fileCounts = Object.values(Architecture).reduce<{ [key: string]: number }>((acc, current) => {
        return { ...acc, [current]: 0 };
      }, {});

      const keepFiles: string[] = [];
      for (let i = (pkg.revisions.length - 1); i >= 0; i--) {
        const revision = pkg.revisions[i];
        if (revision.download_url && revision.channel as string != 'vivid') {
          fileCounts[revision.architecture]++;
          if (fileCounts[revision.architecture] > MAX_REVISIONS) {
            console.log(`[${pkg.id}] removing ${revision.download_url}`);

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
            console.log(`[${pkg.id}] not removing ${revision.download_url}`);
          }
          else {
            console.log(`[${pkg.id}] missing ${revision.download_url}`);
            revision.download_url = null;
          }
        }
      }

      const allFiles = fs.readdirSync(config.data_dir);
      const extraFiles = allFiles.filter((file) => {
        const fullFile = path.join(config.data_dir, file);
        return file.startsWith(`${pkg.id}-xenial`) && !keepFiles.includes(fullFile);
      });

      for (let i = 0; i < extraFiles.length; i++) {
        const file = path.join(config.data_dir, extraFiles[i]);
        console.log(`[${pkg.id}] removing extra file ${file}`);
        fs.unlinkSync(file);
      }

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