import axios from 'axios';
import { expect } from './helper';

async function testRoute(get: Function, route: string) {
  const localRes = await get(route, false).expect(200);
  const prodRes = await axios.get(`https://open-store.io${route}`);

  expect(localRes.body).to.deep.equal(prodRes.data);
}

if (process.env.SNAPSHOT_TEST === 'true') {
  describe('Snapshots', () => {
    context('apps', () => {
      it('app list query matches with prod', async function() {
        await testRoute(this.get, '/api/v4/apps?limit=30&skip=0&sort=-published_date');
      });

      it('fullcircle app matches with prod', async function() {
        await testRoute(this.get, '/api/v4/apps/fullcircle.bhdouglass?channel=xenia');
      });

      it('fullcircle reviews matches with prod', async function() {
        await testRoute(this.get, '/api/v4/apps/fullcircle.bhdouglass/reviews');
      });

      it('gmail webapp matches with prod', async function() {
        await testRoute(this.get, '/api/v4/apps/googlemail.josele13?channel=xenia');
      });

      it('gmail reviews matches with prod', async function() {
        await testRoute(this.get, '/api/v4/apps/googlemail.josele13/reviews');
      });

      // This fails due to the randomized nature of the discover endpoint.
      // TODO maybe make a parameter to return the non-randomized data?
      /*
      it('discover matches with prod', async function() {
        await testRoute(this.get, '/api/v3/discover');
      });
      */

      it('categories matches with prod', async function() {
        await testRoute(this.get, '/api/v3/categories');
      });

      // TODO test revisions api
    });
  });
}
