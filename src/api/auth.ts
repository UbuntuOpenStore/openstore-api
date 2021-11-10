import passport from 'passport';
import { Strategy as UbuntuStrategy } from 'passport-ubuntu';
import { Strategy as LocalAPIKeyStrategy } from 'passport-localapikey';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GitLabStrategy } from 'passport-gitlab2';
import uuid from 'node-uuid';
import express, { Request, Response } from 'express';

import config from '../utils/config';
import logger from '../utils/logger';
import User from '../db/user/model';

const router = express.Router();

function authenticated(req: Request, res: Response) {
  if (!req.user) {
    return res.redirect('/login');
  }

  if (req.headers['user-agent']?.startsWith('OpenStore App')) {
    return res.redirect(`/logged-in?apiKey=${req.user.apikey}`);
  }

  return res.redirect('/manage');
}

passport.serializeUser((user, done) => {
  // This is kinda hacky, but not all ubuntu logins will have an email
  done(null, user.email ? user.email : `UBUNTU_${user.ubuntu_id}`);
});

passport.deserializeUser((identifier, done) => {
  if (identifier.substring(0, 7) == 'UBUNTU_') {
    User.findOne({ ubuntu_id: identifier }, done);
  }
  else {
    User.findOne({ email: identifier }, done);
  }
});

passport.use(new LocalAPIKeyStrategy((apikey, done) => {
  User.findOne({ apikey }).then((user) => {
    if (!user) {
      done(null, false);
    }
    else {
      done(null, user);
    }
  }).catch((err) => {
    done(err);
  });
}));

passport.use(new UbuntuStrategy({
  returnURL: `${config.server.host}/auth/ubuntu/return`,
  realm: config.server.host,
  stateless: true,
}, (identifier, profile, callback) => {
  User.findOne({ ubuntu_id: identifier }).then((user) => {
    if (!user && profile.email) {
      return User.findOne({ email: Array.isArray(profile.email) ? profile.email[0] : profile.email }).then((emailUser) => emailUser);
    }

    return user;
  }).then((existing) => {
    let user = existing;
    if (!user) {
      user = new User();
      user.apikey = uuid.v4();
      user.username = `${Math.random()}`;
      user.language = 'en';
    }

    function uboneParameter(value) {
      if (Array.isArray(value)) {
        return value.length >= 1 ? value[0] : null;
      }
      return value;
    }

    user.ubuntu_id = identifier;
    user.name = uboneParameter(profile.fullname) || user.name;
    user.username = uboneParameter(profile.nickname) || user.username;
    user.email = uboneParameter(profile.email) || user.email;
    user.language = uboneParameter(profile.language) || user.language;

    user.save(callback);
  }).catch((err) => {
    callback(err);
  });
}));

router.post('/ubuntu', passport.authenticate('ubuntu'));
router.get('/ubuntu/return', passport.authenticate('ubuntu'), authenticated);
router.post('/ubuntu/return', passport.authenticate('ubuntu'), authenticated);

if (config.github.clientID && config.github.clientSecret) {
  passport.use(new GitHubStrategy({
    clientID: config.github.clientID,
    clientSecret: config.github.clientSecret,
    callbackURL: `${config.server.host}/auth/github/callback`,
    scope: ['user:email'],
  }, (accessToken, refreshToken, profile, callback) => {
    User.findOne({ github_id: profile.id }).then((user) => {
      const emails = profile.emails.filter((email) => email.verified)
        .map((email) => email.value);

      if (!user && emails) {
        return User.findOne({ email: { $in: emails } }).then((emailUser) => emailUser);
      }

      return user;
    }).then((existing) => {
      let user = existing;
      if (!user) {
        user = new User();
        user.apikey = uuid.v4();
        user.language = 'en';
      }

      user.github_id = profile.id;
      user.email = (!user.email && profile.emails.length >= 1) ? profile.emails[0].value : user.email;
      user.name = user.name ? user.name : profile.displayName;
      user.username = user.username ? user.username : profile.username;

      user.save(callback);
    }).catch((err) => {
      callback(err);
    });
  }));

  router.get('/github', passport.authenticate('github'));
  router.get('/github/callback', passport.authenticate('github'), authenticated);
}
else {
  logger.error('GitHub login is not available, set a client id & secret');
}

if (config.gitlab.clientID && config.gitlab.clientSecret) {
  passport.use(new GitLabStrategy({
    clientID: config.gitlab.clientID,
    clientSecret: config.gitlab.clientSecret,
    callbackURL: `${config.server.host}/auth/gitlab/callback`,
  }, (accessToken, refreshToken, profile, callback) => {
    User.findOne({ gitlab_id: profile.id }).then((user) => {
      const emails = profile.emails.map((email) => email.value);

      if (!user && emails.length > 0) {
        return User.findOne({ email: { $in: emails } }).then((emailUser) => emailUser);
      }

      return user;
    }).then((existing) => {
      let user = existing;
      if (!user) {
        user = new User();
        user.apikey = uuid.v4();
        user.language = 'en';
      }

      user.gitlab_id = profile.id;
      user.email = (!user.email && profile.emails.length > 0) ? profile.emails[0].value : user.email;
      user.name = user.name ? user.name : profile.displayName;
      user.username = user.username ? user.username : profile.username;

      user.save(callback);
    }).catch((err) => {
      callback(err);
    });
  }));

  router.get('/gitlab', passport.authenticate('gitlab'));
  router.get('/gitlab/callback', passport.authenticate('gitlab'), authenticated);
}
else {
  logger.error('GitLab login is not available, set a client id & secret');
}

router.get('/me', (req: Request, res: Response) => {
  if (req.user) {
    res.send({
      success: true,
      data: {
        _id: req.user._id,
        name: req.user.name,
        language: req.user.language,
        username: req.user.username,
        apikey: req.user.apikey,
        role: req.user.role,
      },
      message: null,
    });
  }
  else {
    res.status(401);
    res.send({
      success: false,
      data: null,
      message: 'User not logged in',
    });
  }
});

router.get('/logout', (req: Request, res: Response) => {
  req.logout();
  res.redirect('/');
});

export default router;
