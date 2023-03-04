import { packageSearchInstance } from 'db/package/search';

packageSearchInstance.removeIndex().then(() => {
  console.log('done');
  process.exit(0);
}).catch((err: Error) => {
  console.log(err);
  process.exit(1);
});
