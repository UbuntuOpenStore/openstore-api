/* eslint-disable no-restricted-syntax */
import fs from 'fs';

import 'db'; // Make sure the database connection gets setup
import { Package } from 'db/package';

Package.find({ channels: { $in: ['vivid' as any] } }).then((pkgs) => {
  return Promise.all(pkgs.map((pkg) => {
    if (pkg.revisions) {
      console.log(`processing ${pkg.id}`);

      for (let i = (pkg.revisions.length - 1); i >= 0; i--) {
        const revision = pkg.revisions[i];
        if (revision.download_url && revision.channel as string === 'vivid') {
          console.log(`removing ${revision.download_url}`);
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
      }

      // eslint-disable-next-line no-param-reassign
      pkg.channels = pkg.channels.filter((channel) => channel as string != 'vivid');
      pkg.updateCalculatedProperties();
      return pkg.save();
    }

    return pkg;
  }));
}).then(() => {
  console.log('done removing vivid');
  process.exit(0);
}).catch((err) => {
  console.log(err);
  process.exit(1);
});
