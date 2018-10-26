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

function replace(html, og) {
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

    let ogStart = html.indexOf('<!--og start-->');
    let ogEnd = html.indexOf('<!--og end-->');

    return html.substring(0, ogStart) + ogHtml + html.substring(ogEnd);
}

function match(req) {
    let useragent = req.headers['user-agent'];
    let m = useragents.some((ua) => {
        return useragent.toLowerCase().indexOf(ua.toLowerCase()) !== -1;
    });

    /* eslint-disable no-underscore-dangle */
    return (m || req.query._escaped_fragment_ !== undefined);
}

exports.replace = replace;
exports.match = match;
