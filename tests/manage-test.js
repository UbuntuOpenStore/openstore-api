const {factory} = require('factory-girl');

const {expect} = require('./helper');
const PackageRepo = require('../src/db/package/repo')
const PackageSearch = require('../src/db/package/search');

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

    it('blocks access when not logged in', async function() {
        await this.get(this.route, false).expect(401);
    });

    context('admin user', function() {
        it('shows all apps for an admin user', async function() {
            let res = await this.get(this.route).expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.count).to.equal(2);
            expect(res.body.data.packages).to.have.lengthOf(2);
        });

        it('has a next link', async function() {
            let res = await this.get(`${this.route}?limit=1`).expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.count).to.equal(2);
            expect(res.body.data.packages).to.have.lengthOf(1);
            expect(res.body.data.next).to.include('skip=1');
            expect(res.body.data.next).to.include('limit=1');
        });

        it('has a previous link', async function() {
            let res = await this.get(`${this.route}?limit=1&skip=1`).expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.count).to.equal(2);
            expect(res.body.data.packages).to.have.lengthOf(1);
            expect(res.body.data.previous).to.include('skip=0');
            expect(res.body.data.previous).to.include('limit=1');
        });

        it('searches', async function() {
            let res = await this.get(`${this.route}?search=${this.package.name}`).expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.count).to.equal(1);
            expect(res.body.data.packages).to.have.lengthOf(1);
            expect(res.body.data.packages[0].id).to.equal(this.package.id);
        });
    });

    context('community user', async function() {
        beforeEach(async function() {
            this.user.role = 'community';
            await this.user.save();
        });

        it('shows only the logged in users apps for a community user', async function() {
            let res = await this.get(this.route).expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.count).to.equal(1);
            expect(res.body.data.packages).to.have.lengthOf(1);
            expect(res.body.data.packages[0].id).to.equal(this.package.id);
            expect(res.body.data.packages[0].maintainer).to.equal(this.user._id.toString());
        });
    });
});

describe('Manage GET id', function() {
    before(function() {
        this.route = '/api/v3/manage/';
    });

    beforeEach(async function() {
        [this.package, this.package2] = await Promise.all([
            factory.create('package', {maintainer: this.user._id, name: 'User app'}),
            factory.create('package'),
        ]);
    });

    it('blocks access when not logged in', async function() {
        await this.get(`${this.route}/${this.package.id}`, false).expect(401);
    });

    context('admin user', function() {
        it('sees any app', async function() {
            let res = await this.get(`${this.route}/${this.package.id}`).expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.id).to.equal(this.package.id);
            expect(res.body.data.maintainer).to.equal(this.user._id.toString());
        });

        it('404s on a bad id', async function() {
            await this.get(`${this.route}/foo`).expect(404);
        });
    });

    context('community user', async function() {
        beforeEach(async function() {
            this.user.role = 'community';
            await this.user.save();
        });

        it('sees their own app', async function() {
            let res = await this.get(`${this.route}/${this.package.id}`).expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.id).to.equal(this.package.id);
            expect(res.body.data.maintainer).to.equal(this.user._id.toString());
        });

        it('can not see other apps', async function() {
            await this.get(`${this.route}/${this.package2.id}`).expect(404);
        });
    });
});

describe('Manage POST', function() {
    before(function() {
        this.route = '/api/v3/manage/';
    });

    beforeEach(async function() {
        this.package = await factory.create('package', {maintainer: this.user._id, name: 'User app'});
    });

    it('blocks access when not logged in', async function() {
        await this.post(this.route, false).expect(401);
    });

    context('admin user', function() {
        it('succeeds with a com.ubuntu id', async function() {
            let res = await this.post(this.route)
                .send({id: 'com.ubuntu.app', name: 'App Dev'})
                .expect(200);

            expect(res.body.success).to.be.true;
        });

        it('succeeds with a com.canonical id', async function() {
            let res = await this.post(this.route)
                .send({id: 'com.canonical.app', name: 'App Dev'})
                .expect(200);

            expect(res.body.success).to.be.true;
        });

        it('succeeds with a ubports id', async function() {
            let res = await this.post(this.route)
                .send({id: 'ubports.app', name: 'App Dev'})
                .expect(200);

            expect(res.body.success).to.be.true;
        });

        it('succeeds with a openstore id', async function() {
            let res = await this.post(this.route)
                .send({id: 'OpenStore.app', name: 'App Dev'})
                .expect(200);

            expect(res.body.success).to.be.true;
        });
    });

    context('truested user', function() {
        beforeEach(async function() {
            this.user.role = 'trusted';
            await this.user.save();
        });

        it('succeeds with a com.ubuntu id', async function() {
            let res = await this.post(this.route)
                .send({id: 'com.ubuntu.app', name: 'App Dev'})
                .expect(200);

            expect(res.body.success).to.be.true;
        });

        it('succeeds with a com.canonical id', async function() {
            let res = await this.post(this.route)
                .send({id: 'com.canonical.app', name: 'App Dev'})
                .expect(200);

            expect(res.body.success).to.be.true;
        });

        it('succeeds with a ubports id', async function() {
            let res = await this.post(this.route)
                .send({id: 'ubports.app', name: 'App Dev'})
                .expect(200);

            expect(res.body.success).to.be.true;
        });

        it('succeeds with a openstore id', async function() {
            let res = await this.post(this.route)
                .send({id: 'OpenStore.app', name: 'App Dev'})
                .expect(200);

            expect(res.body.success).to.be.true;
        });
    });

    context('community user', function() {
        beforeEach(async function() {
            this.user.role = 'community';
            await this.user.save();
        });

        it('fails with no id', async function() {
            let res = await this.post(this.route).expect(400);

            expect(res.body.success).to.be.false;
            // TODO make this resiliant to change
            expect(res.body.message).to.equal('No app name specified');
        });

        it('fails with no name', async function() {
            let res = await this.post(this.route)
                .send({id: 'app.dev'})
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('No app title specified');
        });

        it('fails with spaces in the id', async function() {
            let res = await this.post(this.route)
                .send({id: 'app dev', name: 'App Dev'})
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('You cannot have spaces in your app name');
        });

        it('fails with a duplicate id', async function() {
            let res = await this.post(this.route)
                .send({id: this.package.id, name: 'App Dev'})
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('A package with the same name already exists');
        });

        it('fails with a com.ubuntu id', async function() {
            let res = await this.post(this.route)
                .send({id: 'com.ubuntu.app', name: 'App Dev'})
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('You package name is for a domain that you do not have access to');
        });

        it('fails with a com.canonical id', async function() {
            let res = await this.post(this.route)
                .send({id: 'com.canonical.app', name: 'App Dev'})
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('You package name is for a domain that you do not have access to');
        });

        it('fails with a ubports id', async function() {
            let res = await this.post(this.route)
                .send({id: 'ubports.app', name: 'App Dev'})
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('You package name is for a domain that you do not have access to');
        });

        it('fails with a openstore id', async function() {
            let res = await this.post(this.route)
                .send({id: 'OpenStore.app', name: 'App Dev'})
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('You package name is for a domain that you do not have access to');
        });

        it('succeeds with a com.ubuntu.developer id', async function() {
            let res = await this.post(this.route)
                .send({id: 'com.ubuntu.developer.app', name: 'App Dev'})
                .expect(200);

            expect(res.body.success).to.be.true;
        });

        it('creates a new package', async function() {
            let res = await this.post(this.route)
                .send({id: 'app.dev', name: 'App Dev'})
                .expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.id).to.equal('app.dev');
            expect(res.body.data.name).to.equal('App Dev');

            let package = await PackageRepo.findOne('app.dev');
            expect(package).to.exist;
            expect(package.id).to.equal('app.dev');
            expect(package.name).to.equal('App Dev');
            expect(package.published).to.not.be.ok;
            expect(package.maintainer).to.equal(this.user._id.toString());
            expect(package.maintainer_name).to.equal(this.user.username);
        });
    });
});

describe('Manage POST', function() {
    before(function() {
        this.route = '/api/v3/manage/';
    });

    beforeEach(async function() {
        this.removeStub = this.sandbox.stub(PackageSearch, 'remove');
        this.upsertStub = this.sandbox.stub(PackageSearch, 'upsert');

        [this.package, this.package2] = await Promise.all([
            factory.create('package', {maintainer: this.user._id, name: 'User app'}),
            factory.create('package'),
        ]);
    });

    it('blocks access when not logged in', async function() {
        await this.put(`${this.route}/${this.package.id}`, false).expect(401);
    });

    context('admin user', function() {
        it('allows changing the maintainer', async function() {
            let user2 = await factory.create('user')

            let res = await this.put(`${this.route}/${this.package.id}`)
                .send({maintainer: user2._id})
                .expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.maintainer).to.equal(user2._id.toString())
            expect(this.removeStub).to.have.been.calledOnce;

            let package = await PackageRepo.findOne(this.package.id);
            expect(package.maintainer).to.equal(user2._id.toString());
        });

        it('can update any package', async function() {
            let res = await this.put(`${this.route}/${this.package2.id}`)
                .send({name: 'Foo Bar'})
                .expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.name).to.equal('Foo Bar')
            expect(this.removeStub).to.have.been.calledOnce;

            let package = await PackageRepo.findOne(this.package2.id);
            expect(package.name).to.equal('Foo Bar');
        });
    });

    context('community user', function() {
        beforeEach(async function() {
            this.user.role = 'community';
            await this.user.save();
        });

        it('fails with a bad id', async function() {
            await this.put(`${this.route}/foo`).expect(404);
        });

        it('does not allow modifying another users package', async function() {
            await this.put(`${this.route}/${this.package2.id}`).expect(403);
        });

        it('does not allow publishing without revisions', async function() {
            let res = await this.put(`${this.route}/${this.package.id}`)
                .send({published: true})
                .expect(400);

            expect(res.body.success).to.be.false;
            expect(res.body.message).to.equal('You cannot publish your package until you upload a revision');
        });

        it('does not allow changing the maintainer', async function() {
            let res = await this.put(`${this.route}/${this.package.id}`)
                .send({maintainer: 'foo'})
                .expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.maintainer).to.equal(this.user._id.toString())
            expect(this.removeStub).to.have.been.calledOnce;
        });

        it('updates successfully', async function() {
            let res = await this.put(`${this.route}/${this.package.id}`)
                .send({name: 'Foo Bar'})
                .expect(200);

            expect(res.body.success).to.be.true;
            expect(res.body.data.name).to.equal('Foo Bar')
            expect(this.removeStub).to.have.been.calledOnce;

            let package = await PackageRepo.findOne(this.package.id);
            expect(package.name).to.equal('Foo Bar');
        });

        it('publishes the package', async function() {
            this.package.revisions.push({});
            await this.package.save();

            let res = await this.put(`${this.route}/${this.package.id}`)
                .send({published: true})
                .expect(200);

            expect(res.body.success).to.be.true;
            expect(this.upsertStub).to.have.been.calledOnce;

            let package = await PackageRepo.findOne(this.package.id);
            expect(package.published).to.be.true;
        });

        // TODO implement these
        it('adds screenshots');
        it('removes screenshots');
        it('reorders screenshots');

        // TODO test pkg.updateFromBody()
    });
});

describe('Manage DELETE', function() {
    before(function() {
        this.route = '/api/v3/manage/';
    });

    beforeEach(async function() {
        [this.package, this.package2] = await Promise.all([
            factory.create('package', {maintainer: this.user._id, name: 'User app'}),
            factory.create('package'),
        ]);
    });

    context('adminuser', function() {
        it('can delete any package', async function() {
            await this.delete(`${this.route}/${this.package.id}`).expect(200);

            let package = await PackageRepo.findOne(this.package.id);
            expect(package).to.be.null;
        });
    });

    context('community user', function() {
        beforeEach(async function() {
            this.user.role = 'community';
            await this.user.save();
        });

        it('fails with a bad id', async function() {
            await this.delete(`${this.route}/foo`).expect(404);
        });

        it('does not allow modifying another users package', async function() {
            await this.delete(`${this.route}/${this.package2.id}`).expect(403);
        });

        it('does not allow deleting an app with revisions', async function() {
            this.package.revisions.push({});
            await this.package.save();

            await this.delete(`${this.route}/${this.package.id}`).expect(400);
        });

        it('deletes a package', async function() {
            await this.delete(`${this.route}/${this.package.id}`).expect(200);

            let package = await PackageRepo.findOne(this.package.id);
            expect(package).to.be.null;
        });
    });
});
