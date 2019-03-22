const {factory} = require('factory-girl');

const {expect} = require('./helper');

describe('Manage GET', function() {
  before(function() {
    this.route = '/api/v3/manage/';
  });

  beforeEach(async function() {
    [this.package] = await Promise.all([
      factory.create('package', {maintainer: this.user._id, name: 'User app'}),
      factory.create('package'),
    ]);
  });

  it('blocks access when not logged in', function(done) {
    this.get(this.route, false)
      .expect(401)
      .end(done);
  });

  context('admin user', function() {
    it('shows all apps for an admin user', function(done) {
      this.get(this.route)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.true
          expect(res.body.data.count).to.equal(2)
          expect(res.body.data.packages).to.have.lengthOf(2)

          done();
        });
    });

    it('has a next link', function(done) {
      this.get(`${this.route}?limit=1`)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.true
          expect(res.body.data.count).to.equal(2)
          expect(res.body.data.packages).to.have.lengthOf(1)
          expect(res.body.data.next).to.include('skip=1')
          expect(res.body.data.next).to.include('limit=1')
          done();
        });
    });

    it('has a previous link', function(done) {
      this.get(`${this.route}?limit=1&skip=1`)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.true
          expect(res.body.data.count).to.equal(2)
          expect(res.body.data.packages).to.have.lengthOf(1)
          expect(res.body.data.previous).to.include('skip=0')
          expect(res.body.data.previous).to.include('limit=1')

          done();
        });
    });

    it('searches', function(done) {
      this.get(`${this.route}?search=${this.package.name}`)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.true
          expect(res.body.data.count).to.equal(1)
          expect(res.body.data.packages).to.have.lengthOf(1)
          expect(res.body.data.packages[0].id).to.equal(this.package.id)

          done();
        });
    });
  });

  context('community user', function() {
    beforeEach(async function() {
      this.user.role = 'community';
      await this.user.save();
    });

    it('shows only the logged in users apps for a community user', function(done) {
      this.get(this.route)
        .expect(200)
        .end((err, res) => {
          if (err) return done(err);

          expect(res.body.success).to.be.true
          expect(res.body.data.count).to.equal(1)
          expect(res.body.data.packages).to.have.lengthOf(1)
          expect(res.body.data.packages[0].id).to.equal(this.package.id)
          expect(res.body.data.packages[0].maintainer).to.equal(this.user._id.toString())

          done();
        });
    });
  });
});
