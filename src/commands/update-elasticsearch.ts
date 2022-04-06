import 'db'; // Make sure the database connection gets setup
import PackageSearch from 'db/package/search';
import { Package } from 'db/package';
import { PackageDoc } from 'db/package/types';
import { recalculateRatings } from '../api/reviews';

Package.find({ published: true }).then((pkgs) => {
  return Promise.all(pkgs.map((pkg) => {
    return recalculateRatings(pkg._id);
  }).filter((pkg) => !!pkg));
}).then((pkgs) => {
  return PackageSearch.bulk(pkgs as PackageDoc[]);
}).then(() => {
  console.log('done');
  process.exit(0);
})
  .catch((err) => {
    console.log(err);
    process.exit(1);
  });
