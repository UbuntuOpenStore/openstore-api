const passport = require('passport');
const path = require('path');

const helpers = require('./helpers');
const config = require('./config');
const fs = require('./async-fs');

// list borrowed from https://github.com/prerender/prerender-node
let useragents = [
    /*
    'googlebot',
    'yahoo',
    'bingbot',
    */
    'baiduspider',
    'facebookexternalhit',
    'twitterbot',
    'rogerbot',
    'linkedinbot',
    'embedly',
    'quora link preview',
    'showyoubot',
    'outbrain',
    'pinterest',
    'developers.google.com/+/web/snippet',
    'slackbot',
    'vkShare',
    'W3C_Validator',
    'DuckDuckBot',
];

function ogReplace(html, og) {
    let ogHtml = `
        <meta name="description" content="${og.description}" />
        <meta itemprop="name" content="${og.title}" />
        <meta itemprop="description" content="${og.description}" />
        <meta itemprop="image" content="${og.image}" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:site" content="@uappexplorer" />
        <meta name="twitter:title" content="${og.title}" />
        <meta name="twitter:description" content="${og.description}" />
        <meta name="twitter:image:src" content="${og.image}" />
        <meta property="og:title" content="${og.title}" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="${og.url}" />
        <meta property="og:image" content="${og.image}" />
        <meta property="og:description" content="${og.description}" />
        <meta property="og:site_name" content="${og.title} - OpenStore" />
    `;

    let ogStart = html.indexOf('<meta name=opengraphstart>');
    let ogEnd = html.indexOf('<meta name=opengraphend>');

    return html.substring(0, ogStart) + ogHtml + html.substring(ogEnd);
}

function ogMatch(req) {
    let useragent = req.headers['user-agent'];
    let m = useragents.some((ua) => useragent.toLowerCase().indexOf(ua.toLowerCase()) !== -1);

    /* eslint-disable no-underscore-dangle */
    return (m || req.query._escaped_fragment_ !== undefined);
}

async function opengraph(req, res, next) {
    if (req.originalUrl.startsWith('/app/') && req.params.name && ogMatch(req)) {
        try {
            let pkg = await PackageRepo.findOne(req.params.name, {published: true});

            if (!pkg) {
                res.status(404);
                return res.send();
            }

            let data = await fs.readFileAsync(path.join(config.server.static_root, 'index.html'), {encoding: 'utf8'});

            res.header('Content-Type', 'text/html');
            res.status(200);
            return res.send(ogReplace(data, {
                title: pkg.name,
                url: `${config.server.host}/app/${pkg.id}`,
                image: pkg.icon,
                description: pkg.tagline ? pkg.tagline : '',
            }));
        }
        catch (err) {
            res.status(500);
            return res.send();
        }
    }
    else {
        return next();
    }
}


function userRole(req, res, next) {
    req.isAdminUser = (req.isAuthenticated() && req.user.role == 'admin');
    req.isTrustedUser = (req.isAuthenticated() && req.user.role == 'trusted');

    if (req.isAuthenticated() && req.user && req.user.role != 'disabled') {
        next();
    }
    else {
        error(res, 'Your account has been disabled at this time', 403);
    }
}

function adminOnly(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.role == 'admin') {
        next();
    }
    else {
        error(res, 'Forbidden', 403);
    }
}

function downloadFile(req, res, next) {
    if (!req.file && req.body && req.body.downloadUrl) {
        let filename = path.basename(req.body.downloadUrl);

        // Strip extra hashes & params
        if (filename.indexOf('?') >= 0) {
            filename = filename.substring(0, filename.indexOf('?'));
        }

        if (filename.indexOf('#') >= 0) {
            filename = filename.substring(0, filename.indexOf('#'));
        }

        download(req.body.downloadUrl, `${config.data_dir}/${filename}`).then((tmpfile) => {
            req.files = {
                file: [{
                    originalname: filename,
                    path: tmpfile,
                    size: fs.statSync(tmpfile).size,
                }],
            };
            next();
        }).catch(() => {
            error(res, 'Failed to download remote file', 400);
        });
    }
    else {
        next();
    }
}

exports.authenticate = passport.authenticate('localapikey', {session: false})
exports.userRole = userRole;
exports.adminOnly = adminOnly;
exports.downloadFile = downloadFile;
exports.opengraph = opengraph;
