//list borrowed from https://github.com/prerender/prerender-node
var useragents = [
    //'googlebot',
    //'yahoo',
    //'bingbot',
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
    'W3C_Validator'
];

function replace(html, og) {
    var og_html = '<meta name="description" content="' + og.description + '" />' +
        '<meta itemprop="name" content="' + og.title + '" />' +
        '<meta itemprop="description" content="' + og.description + '" />' +
        '<meta itemprop="image" content="' + og.image + '" />' +
        '<meta name="twitter:card" content="summary" />' +
        '<meta name="twitter:site" content="@uappexplorer" />' +
        '<meta name="twitter:title" content="' + og.title + '" />' +
        '<meta name="twitter:description" content="' + og.description + '" />' +
        '<meta name="twitter:image:src" content="' + og.image + '" />' +
        '<meta property="og:title" content="' + og.title + '" />' +
        '<meta property="og:type" content="website" />' +
        '<meta property="og:url" content="' + og.url + '" />' +
        '<meta property="og:image" content="' + og.image + '" />' +
        '<meta property="og:description" content="' + og.description + '" />' +
        '<meta property="og:site_name" content="' + og.title + ' - OpenStore' + '" />';

    return html.replace('<meta name="opengraphdata" />', og_html).replace('<meta name=opengraphdata>', og_html);
}

function match(req) {
    var useragent = req.headers['user-agent'];
    var m = useragents.some(function(ua) {
        return useragent.toLowerCase().indexOf(ua.toLowerCase()) !== -1;
    });

    return (m || req.query._escaped_fragment_ !== undefined);
}

exports.replace = replace;
exports.match = match;
