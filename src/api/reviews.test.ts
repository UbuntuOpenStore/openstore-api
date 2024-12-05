import { test, describe, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { cleanMongoose, closeMongoose, waitForMongoose } from 'tests/utils';
import factory, { type TestPackage, type TestUser } from 'tests/factory';
import * as api from 'api';
import { type App } from 'supertest/types';

import { Package } from 'db/package';
import { Review } from 'db/review';
import { recalculatePackageRatings } from 'db/rating_count/utils';
import { Architecture, Channel } from 'db/package/types';
import * as messages from 'utils/error-messages';

describe('Reviews', () => {
  let route: string;
  let app: App;
  let package1: TestPackage;
  let user1: TestUser;
  let user2: TestUser;
  let user3: TestUser;
  let user4: TestUser;

  before(async () => {
    await waitForMongoose();

    app = api.setup();
  });

  after(async () => {
    await closeMongoose();
  });

  beforeEach(async () => {
    await cleanMongoose();

    [user1, user2, user3, user4] = await Promise.all([
      factory.user(),
      factory.user(),
      factory.user(),
      factory.user(),
    ]);
    route = `/api/v4/apps/pkg-id/reviews?apikey=${user1.apikey}`;

    package1 = await factory.package({
      id: 'pkg-id',
      maintainer: user2._id.toString(),
      published: true,
      revisions: [
        {
          revision: 1,
          version: '1.0.0',
          channel: Channel.FOCAL,
          architecture: Architecture.ALL,
          framework: 'ubuntu-sdk-20.04',
          download_url: 'url',
        },
      ],
    });

    await Promise.all([
      factory.review({ pkg: package1._id, user: user3._id, rating: 'HAPPY' }),
      factory.review({ pkg: package1._id, user: user4._id, rating: 'NEUTRAL' }),
    ]);

    await recalculatePackageRatings(package1._id);
  });

  describe('GET', () => {
    test('shows all reviews (without authentication)', async () => {
      const res = await request(app).get(route).expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.count, 2);
      assert.equal(res.body.data.reviews.length, 2);
    });

    test('shows own review', async () => {
      await factory.review({ pkg: package1._id, user: user1._id });
      const res = await request(app).get(`${route}&filter=apikey`).expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.count, 1);
      assert.equal(res.body.data.reviews.length, 1);
      assert.equal(res.body.data.reviews[0].author, user1.name);
    });

    test('shows review stats on the package', async () => {
      const res = await request(app).get('/api/v4/apps/pkg-id').expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.ratings.HAPPY, 1);
      assert.equal(res.body.data.ratings.NEUTRAL, 1);
    });

    test('does not return redacted reviews', async () => {
      await factory.review({ pkg: package1._id, user: user1._id, redacted: true });
      const res = await request(app).get(route).expect(200);

      assert.ok(res.body.success);
      assert.equal(res.body.data.count, 2);
      assert.equal(res.body.data.reviews.length, 2);
    });
  });

  describe('PUT/POST', () => {
    test('creates own review', async () => {
      const res = await request(app).post(route)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(200);

      assert.ok(res.body.success);

      const review = await Review.findOne({ user: user1._id });
      assert.equal(review?.body, 'great app');
      assert.equal(review?.version, '1.0.0');
      assert.equal(review?.rating, 'THUMBS_UP');
      assert.ok(review?.date);
      assert.equal(review?.redacted, false);
      assert.equal(review?.pkg.toString(), package1._id.toString());
      assert.equal(review?.user.toString(), user1._id.toString());
    });

    test('updates own review', async () => {
      await factory.review({ pkg: package1._id, user: user1._id, rating: 'THUMBS_DOWN' });
      await recalculatePackageRatings(package1._id);

      let pkg = await Package.findOne({ id: package1.id }).populate('rating_counts');
      let checkRatings = pkg!.rating_counts.reduce((accumulator, count) => {
        return {
          ...accumulator,
          [count.name]: count.count,
        };
      }, {});
      assert.deepEqual(checkRatings, { THUMBS_UP: 0, THUMBS_DOWN: 1, HAPPY: 1, NEUTRAL: 1, BUGGY: 0 });

      const res = await request(app).put(route)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(200);

      assert.ok(res.body.success);

      const reviews = await Review.find({ user: user1._id });
      assert.equal(reviews.length, 1);

      const review = reviews[0];
      assert.equal(review?.body, 'great app');
      assert.equal(review?.version, '1.0.0');
      assert.equal(review?.rating, 'THUMBS_UP');
      assert.ok(review?.date);
      assert.equal(review?.redacted, false);
      assert.equal(review?.pkg.toString(), package1._id.toString());
      assert.equal(review?.user.toString(), user1._id.toString());

      pkg = await Package.findOne({ id: package1.id }).populate('rating_counts');
      checkRatings = pkg!.rating_counts.reduce((accumulator, count) => {
        return {
          ...accumulator,
          [count.name]: count.count,
        };
      }, {});
      assert.deepEqual(checkRatings, { THUMBS_UP: 1, THUMBS_DOWN: 0, HAPPY: 1, NEUTRAL: 1, BUGGY: 0 });
    });

    test('throws a 404 when the package cannot be found', async () => {
      const res = await request(app).post(`/api/v4/apps/bad-id/reviews?apikey=${user1.apikey}`)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.APP_NOT_FOUND);
    });

    test('throws a 400 when reviewing own app', async () => {
      package1.maintainer = user1._id;
      await package1.save();

      const res = await request(app).post(route)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.CANNOT_REVIEW_OWN_APP);
    });

    test('throws a 404 when the revision cannot be found', async () => {
      const res = await request(app).post(route)
        .send({ body: 'great app', version: 'nope', rating: 'THUMBS_UP' })
        .expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.VERSION_NOT_FOUND);
    });

    test('throws a 400 when the review is long winded', async () => {
      const res = await request(app).post(route)
        .send({ body: 'a'.repeat(600), version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.REVIEW_TOO_LONG);
    });

    test('throws a 400 when the rating is invalid', async () => {
      const res = await request(app).post(route)
        .send({ body: 'great app', version: '1.0.0', rating: 'INVALID' })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.INVALID_RATING);
    });

    test('throws a 400 when missing parameters', async () => {
      const res = await request(app).post(route)
        .send({ body: 'great app', version: '', rating: 'THUMBS_UP' })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.PARAMETER_MISSING);
    });

    test('creates a new review when trying to update a nonexistent review', async () => {
      const res = await request(app).put(route)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(200);

      assert.ok(res.body.success);

      const review = await Review.findOne({ user: user1._id });
      assert.equal(review?.body, 'great app');
      assert.equal(review?.version, '1.0.0');
      assert.equal(review?.rating, 'THUMBS_UP');
      assert.ok(review?.date);
      assert.equal(review?.redacted, false);
      assert.equal(review?.pkg.toString(), package1._id.toString());
      assert.equal(review?.user.toString(), user1._id.toString());
    });

    test('throws a 400 when updating a redacted review', async () => {
      await factory.review({ pkg: package1._id, user: user1._id, redacted: true });
      const res = await request(app).put(route)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.message, messages.REVIEW_REDACTED);
    });

    test('updates existing review when to create another review', async () => {
      await factory.review({ pkg: package1._id, user: user1._id });
      const res = await request(app).post(route)
        .send({ body: 'really great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(200);

      assert.ok(res.body.success);

      const reviews = await Review.find({ user: user1._id });
      assert.equal(reviews.length, 1);

      const review = reviews[0];
      assert.equal(review?.body, 'really great app');
      assert.equal(review?.version, '1.0.0');
      assert.equal(review?.rating, 'THUMBS_UP');
      assert.ok(review?.date);
      assert.equal(review?.redacted, false);
      assert.equal(review?.pkg.toString(), package1._id.toString());
      assert.equal(review?.user.toString(), user1._id.toString());
    });
  });
});
