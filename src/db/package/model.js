const mongoose = require('mongoose');

const packageSchema = mongoose.Schema({
    id: {type: String, index: true},

    // Presentation
    name: String,
    tagline: String,
    description: String,
    changelog: String,
    screenshots: [String],

    // Discovery
    category: String,
    keywords: [String],
    nsfw: Boolean,

    // Info
    license: String,
    source: String,
    support_url: String,
    donate_url: String,
    video_url: String,
    maintainer: String,
    maintainer_name: String,
    framework: String,

    // Metadata
    author: String,
    version: String, // TODO depricate
    filesize: Number,
    manifest: {},
    types: [String],
    languages: [],
    architectures: [String],

    // Publication metadata
    published: Boolean,
    published_date: String,
    updated_date: String,

    // Revisions
    revisions: [
        /*
        {
            revision: Number,
            version: String, // Unique among revisions
            downloads: Number,
            channel: String, // vivid, xenial
            download_url: String,
            download_sha512: String,
        }
        */
    ], // Revisions and stats
    channels: [], // vivid, xenial

    icon: String,
}, {usePushEach: true});

packageSchema.virtual('architecture').get(function() {
    return this.architectures.join(',');
});

function getRevision(pkg, channel) {
    let data = null;
    pkg.revisions.filter((revisionData) => (revisionData.channel == channel))
        .forEach((revisionData) => {
            if (!data || data.revision < revisionData.revision) {
                data = revisionData;
            }
        });

    return data;
}

packageSchema.virtual('next_revision').get(function() {
    let revision = 0;
    let revisions = this.revisions.map((data) => data.revision);

    if (revisions.length > 0) {
        revision = Math.max(...revisions);
    }

    return revision + 1;
});

packageSchema.index(
    {
        name: 'text',
        description: 'text',
        keywords: 'text',
        author: 'text',
    },
    {
        weights: {
            name: 10,
            description: 5,
            keywords: 3,
            author: 1,
        },
        name: 'searchIndex',
    },
);

packageSchema.methods.getLatestRevision = function(channel) {
    let revisionData = null;
    let revisionIndex = -1;
    this.revisions.filter((data) => (data.channel == channel))
        .forEach((data, index) => {
            if (!revisionData || revisionData.revision < data.revision) {
                revisionData = data;
                revisionIndex = index;
            }
        });

    return { revisionData, revisionIndex };
};

const Package = mongoose.model('Package', packageSchema);

Package.XENIAL = 'xenial';
Package.VIVID = 'vivid';
Package.CHANNELS = [
    Package.XENIAL,
    Package.VIVID,
];

module.exports = Package;
