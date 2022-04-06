import PackageSearch from 'db/package/search';

PackageSearch.createIndex().then(() => {
  console.log('done');
  process.exit(0);
}).catch((err: Error) => {
  console.log(err);
  process.exit(1);
});