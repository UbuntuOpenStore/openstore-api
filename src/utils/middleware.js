const passport = require('passport');

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

exports.authenticate = passport.authenticate('localapikey', {session: false})
exports.userRole = userRole;
exports.adminOnly = adminOnly;
