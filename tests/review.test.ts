import factory from './factory';

import { expect } from './helper';
import { recalculateRatings } from '../src/api/reviews';
import Package from '../src/db/package/model';
import Review from '../src/db/review/model';

describe('Reviews', () => {
  before(function() {
    this.route = '/api/v4/apps/pkg-id/reviews';
  });

  beforeEach(async function() {
    const [user2, user3, user4] = await Promise.all([
      factory.user(),
      factory.user(),
      factory.user(),
    ]);

    this.package = await factory.package({
      id: 'pkg-id',
      maintainer: user2._id,
      published: true,
      revisions: [
        {
          revision: 1,
          version: '1.0.0',
          channel: Package.XENIAL,
          architecture: Package.ALL,
          framework: 'ubuntu-sdk-16.04',
          download_url: 'url',
        },
      ],
    });

    [this.review] = await Promise.all([
      factory.review({ pkg: this.package._id, user: user3._id, rating: 'HAPPY' }),
      factory.review({ pkg: this.package._id, user: user4._id, rating: 'NEUTRAL' }),
    ]);

    await recalculateRatings(this.package._id);
  });

  context('GET', () => {
    it('shows all reviews (without authentication)', async function() {
      const res = await this.get(this.route, false).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.count).to.equal(2);
      expect(res.body.data.reviews).to.have.lengthOf(2);
    });

    it('shows own review', async function() {
      await factory.review({ pkg: this.package._id, user: this.user._id });
      const res = await this.get(`${this.route}?filter=apikey`).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.count).to.equal(1);
      expect(res.body.data.reviews).to.have.lengthOf(1);
      expect(res.body.data.reviews[0].author).to.equal(this.user.name);
    });

    it('shows review stats on the package', async function() {
      const res = await this.get('/api/v4/apps/pkg-id').expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.ratings.HAPPY).to.equal(1);
      expect(res.body.data.ratings.NEUTRAL).to.equal(1);
    });

    it('does not return redacted reviews', async function() {
      await factory.review({ pkg: this.package._id, user: this.user._id, redacted: true });
      const res = await this.get(this.route, false).expect(200);

      expect(res.body.success).to.be.true;
      expect(res.body.data.count).to.equal(2);
      expect(res.body.data.reviews).to.have.lengthOf(2);
    });
  });

  context('PUT/POST', () => {
    it('creates own review', async function() {
      const res = await this.post(this.route)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(200);

      expect(res.body.success).to.be.true;

      const review = await Review.findOne({ user: this.user._id });
      expect(review?.body).to.equal('great app');
      expect(review?.version).to.equal('1.0.0');
      expect(review?.rating).to.equal('THUMBS_UP');
      expect(review?.date).to.exist;
      expect(review?.redacted).to.be.false;
      expect(review?.pkg.toString()).to.equal(this.package._id.toString());
      expect(review?.user.toString()).to.equal(this.user._id.toString());
    });

    it('updates own review', async function() {
      await factory.review({ pkg: this.package._id, user: this.user._id, rating: 'THUMBS_DOWN' });
      await recalculateRatings(this.package._id);

      let pkg = await Package.findOne({ id: this.package.id }).populate('rating_counts');
      let checkRatings = pkg!.rating_counts.reduce((accumulator, count) => {
        return {
          ...accumulator,
          [count.name]: count.count,
        };
      }, {});
      expect(checkRatings).to.deep.equal({ THUMBS_UP: 0, THUMBS_DOWN: 1, HAPPY: 1, NEUTRAL: 1, BUGGY: 0 });

      const res = await this.put(this.route)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(200);

      expect(res.body.success).to.be.true;

      const reviews = await Review.find({ user: this.user._id });
      expect(reviews).to.be.lengthOf(1);

      const review = reviews[0];
      expect(review?.body).to.equal('great app');
      expect(review?.version).to.equal('1.0.0');
      expect(review?.rating).to.equal('THUMBS_UP');
      expect(review?.date).to.exist;
      expect(review?.redacted).to.be.false;
      expect(review?.pkg.toString()).to.equal(this.package._id.toString());
      expect(review?.user.toString()).to.equal(this.user._id.toString());

      pkg = await Package.findOne({ id: this.package.id }).populate('rating_counts');
      checkRatings = pkg!.rating_counts.reduce((accumulator, count) => {
        return {
          ...accumulator,
          [count.name]: count.count,
        };
      }, {});
      expect(checkRatings).to.deep.equal({ THUMBS_UP: 1, THUMBS_DOWN: 0, HAPPY: 1, NEUTRAL: 1, BUGGY: 0 });
    });

    it('throws a 404 when the package cannot be found', async function() {
      const res = await this.post('/api/v4/apps/bad-id/reviews')
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(404);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('App not found');
    });

    it('throws a 400 when reviewing own app', async function() {
      this.package.maintainer = this.user._id;
      await this.package.save();

      const res = await this.post(this.route)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Reviewing your own app is not allowed');
    });

    it('throws a 404 when the revision cannot be found', async function() {
      const res = await this.post(this.route)
        .send({ body: 'great app', version: 'nope', rating: 'THUMBS_UP' })
        .expect(404);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Specified version is unknown');
    });

    it('throws a 400 when the review is long winded', async function() {
      const res = await this.post(this.route)
        .send({ body: 'a'.repeat(600), version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('The review is too long');
    });

    it('throws a 400 when the rating is invalid', async function() {
      const res = await this.post(this.route)
        .send({ body: 'great app', version: '1.0.0', rating: 'INVALID' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Invalid rating');
    });

    it('throws a 400 when missing parameters', async function() {
      const res = await this.post(this.route)
        .send({ body: 'great app', version: '', rating: 'THUMBS_UP' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Missing parameters for this endpoint');
    });

    it('throws a 400 when updating a non existent review', async function() {
      const res = await this.put(this.route)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('You have no review to edit');
    });

    it('throws a 400 when updating a redacted review', async function() {
      await factory.review({ pkg: this.package._id, user: this.user._id, redacted: true });
      const res = await this.put(this.route)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('Redacted reviews cannot be edited');
    });

    it('throws a 400 when trying to create another review', async function() {
      await factory.review({ pkg: this.package._id, user: this.user._id });
      const res = await this.post(this.route)
        .send({ body: 'great app', version: '1.0.0', rating: 'THUMBS_UP' })
        .expect(400);

      expect(res.body.success).to.be.false;
      expect(res.body.message).to.equal('This app was already reviewed by you');
    });
  });

  // TODO more tests
});
