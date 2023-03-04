import 'db'; // Make sure the database connection gets setup
import { packageSearchInstance } from 'db/package/search';
import { Package } from 'db/package';
import { PackageDoc } from 'db/package/types';
import { recalculatePackageRatings } from 'db/rating_count/utils';

Package.find({ published: true }).then((pkgs) => {
  return Promise.all(pkgs.map((pkg) => {
    return recalculatePackageRatings(pkg._id);
  }).filter((pkg) => !!pkg));
}).then((pkgs) => {
  return packageSearchInstance.bulk(pkgs as PackageDoc[]);
}).then(() => {
  console.log('done');
  process.exit(0);
})
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
