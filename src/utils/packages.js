// TODO move and clean up
function parseFiltersFromRequest(req) {
    let types = [];
    if (req.query.types && Array.isArray(req.query.types)) {
        types = req.query.types;
    }
    else if (req.query.types) {
        types = [req.query.types];
    }
    else if (req.body && req.body.types) {
        types = req.body.types;
    }

    // Handle non-pluralized form
    if (req.query.type && Array.isArray(req.query.type)) {
        types = req.query.type;
    }
    else if (req.query.type) {
        types = [req.query.type];
    }
    else if (req.body && req.body.type) {
        types = req.body.type;
    }

    if (types.indexOf('webapp') >= 0 && types.indexOf('webapp+') == -1) {
        types.push('webapp+');
    }

    let ids = [];
    if (req.query.apps) {
        ids = req.query.apps.split(',');
    }
    else if (req.body && req.body.apps) {
        ids = req.body.apps;
    }

    let frameworks = [];
    if (req.query.frameworks) {
        frameworks = req.query.frameworks.split(',');
    }
    else if (req.body && req.body.frameworks) {
        frameworks = req.body.frameworks;
    }

    let architecture = '';
    let architectures = [];
    if (req.query.architecture) {
        architecture = req.query.architecture;
    }
    else if (req.body && req.body.architecture) {
        architecture = req.body.architecture;
    }

    if (architecture) {
        architectures = [architecture];
        if (architecture != 'all') {
            architectures.push('all');
        }
    }

    let category = null;
    if (req.query.category) {
        category = req.query.category;
    }
    else if (req.body && req.body.category) {
        category = req.body.category;
    }

    let author = null;
    if (req.query.author) {
        author = req.query.author;
    }
    else if (req.body && req.body.author) {
        author = req.body.author;
    }

    let search = '';
    if (req.query.search) {
        search = req.query.search;
    }
    else if (req.body && req.body.search) {
        search = req.body.search;
    }

    let channel = null;
    if (req.query.channel) {
        channel = req.query.channel;
    }
    else if (req.body && req.body.channel) {
        channel = req.body.channel;
    }

    let nsfw = null;
    if (
        (req.query.nsfw === false || (req.query.nsfw && req.query.nsfw.toLowerCase() == 'false')) ||
        (req.body && (req.body.nsfw === false || (req.query.nsfw && req.query.nsfw.toLowerCase() == 'false')))
    ) {
        nsfw = [null, false];
    }

    if (
        (req.query.nsfw === true || (req.query.nsfw && req.query.nsfw.toLowerCase() == 'true')) ||
        (req.body && (req.body.nsfw === true || (req.query.nsfw && req.query.nsfw.toLowerCase() == 'true')))
    ) {
        nsfw = true;
    }

    return {
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 0,
        skip: req.query.skip ? parseInt(req.query.skip, 10) : 0,
        sort: req.query.sort ? req.query.sort : 'relevance',
        types: types,
        ids: ids,
        frameworks: frameworks,
        architectures: architectures,
        category: category,
        author: author,
        search: search,
        channel: channel,
        nsfw: nsfw,
    };
}

exports.parseFiltersFromRequest = parseFiltersFromRequest;
