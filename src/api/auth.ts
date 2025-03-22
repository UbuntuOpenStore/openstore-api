import passport from 'passport';
// @ts-ignore
import { Strategy as UbuntuStrategy } from 'passport-ubuntu';
// @ts-ignore
import { Strategy as LocalAPIKeyStrategy } from 'passport-localapikey';
// @ts-ignore
import { Strategy as GitHubStrategy } from 'passport-github2';
// @ts-ignore
import { Strategy as GitLabStrategy } from 'passport-gitlab2';
import { v4 } from 'uuid';
import express, { type NextFunction, type Request, type Response } from 'express';
import { type HydratedUser, User } from 'db/user';

import { logger, config, asyncErrorWrapper } from 'utils';

// Passport doesn't seem to have nice types for the `done` callback
export interface GenericCallback {
  // eslint-disable-next-line no-unused-vars, @typescript-eslint/prefer-function-type
  (err: any, arg1?: any, arg2?: any): void;
}

export type PassportProfile = {
  [key: string]: any;
};

function replaceName(name?: string, email?: string): string {
  if (email?.endsWith('@ubports.com')) {
    return name ?? '';
  }

  return (name ?? '')
    .replace(/ubports/gi, 'user')
    .replace(/open store/gi, 'user')
    .replace(/openstore/gi, 'user')
    .replace(/open-store/gi, 'user')
    .replace(/ubuntu touch/gi, 'user')
    .replace(/ubuntu/gi, 'user');
}

const router = express.Router();

function safeParseUrl(url: string) {
  try {
    return new URL(url, config.server.host);
  }
  catch (e) {

  }
}

function saveReturnTo(req: Request, res: Response, next: NextFunction) {
  if (typeof req.query.next === 'string' && req.session) {
    const url = safeParseUrl(req.query.next);
    if (url?.hostname.endsWith(config.server.domain)) {
      req.session.returnTo = req.query.next;
    }
  }

  next();
}

function authenticated(req: Request, res: Response) {
  if (!req.user) {
    res.redirect('/login');
    return;
  }

  if (req.headers['user-agent']?.startsWith('OpenStore App')) {
    res.redirect(`/logged-in?apiKey=${req.user.apikey}`);
    return;
  }

  if (typeof req.session?.returnTo === 'string') {
    const returnTo = req.session.returnTo;
    const returnToUrl = safeParseUrl(returnTo);
    delete req.session.returnTo;

    if (returnToUrl && returnToUrl.hostname !== config.server.domain) {
      res.redirect(`${returnTo}?key=${req.user.apikey}`);
    }
    else {
      res.redirect(returnTo);
    }
  }
  else {
    res.redirect('/manage');
  }
}

passport.serializeUser((user: HydratedUser, done: GenericCallback) => {
  // This is kinda hacky, but not all ubuntu logins will have an email
  done(null, user.email ? user.email : `UBUNTU_${user.ubuntu_id ?? ''}`);
});

passport.deserializeUser((identifier: string, done: GenericCallback) => {
  if (identifier.substring(0, 7) === 'UBUNTU_') {
    User.findOne({ ubuntu_id: identifier })
      .then((user) => { done(undefined, user); })
      .catch((err) => { done(err); });
  }
  else {
    User.findOne({ email: identifier })
      .then((user) => { done(undefined, user); })
      .catch((err) => { done(err); });
  }
});

passport.use(new LocalAPIKeyStrategy((apikey: string, done: GenericCallback) => {
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
}, (identifier: string, profile: PassportProfile, callback: GenericCallback) => {
  User.findOne({ ubuntu_id: identifier }).then((user) => {
    if (!user && profile.email) {
      return User.findOne({ email: Array.isArray(profile.email) ? profile.email[0] : profile.email }).then((emailUser) => emailUser);
    }

    return user;
  }).then((existing: HydratedUser | null) => {
    let user = existing;
    if (!user) {
      user = new User();
      user.apikey = v4();
      user.username = `${Math.random()}`;
      user.language = 'en';
    }

    function uboneParameter(value: string | string[]) {
      if (Array.isArray(value)) {
        return value.length >= 1 ? value[0] : null;
      }
      return value;
    }

    user.ubuntu_id = identifier;
    user.email = uboneParameter(profile.email) || user.email;
    user.name = replaceName(uboneParameter(profile.fullname) || user.name, user.email);
    user.username = replaceName(uboneParameter(profile.nickname) || user.username, user.email);
    user.language = uboneParameter(profile.language) || user.language;

    return user.save();
  }).then((user) => {
    callback(undefined, user);
  })
    .catch((err) => {
      callback(err);
    });
}));

router.post('/ubuntu', saveReturnTo, asyncErrorWrapper(passport.authenticate('ubuntu')));
router.get('/ubuntu/return', asyncErrorWrapper(passport.authenticate('ubuntu')), authenticated);
router.post('/ubuntu/return', asyncErrorWrapper(passport.authenticate('ubuntu')), authenticated);

if (config.github.clientID && config.github.clientSecret) {
  passport.use(new GitHubStrategy({
    clientID: config.github.clientID,
    clientSecret: config.github.clientSecret,
    callbackURL: `${config.server.host}/auth/github/callback`,
    scope: ['user:email'],
  }, (accessToken: string, refreshToken: string, profile: PassportProfile, callback: GenericCallback) => {
    User.findOne({ github_id: profile.id }).then((user) => {
      const emails = profile.emails.filter((email: { verified: boolean; value: string }) => email.verified)
        .map((email: { verified: boolean; value: string }) => email.value);

      if (!user && emails) {
        return User.findOne({ email: { $in: emails } }).then((emailUser) => emailUser);
      }

      return user;
    }).then((existing) => {
      let user = existing;
      if (!user) {
        user = new User();
        user.apikey = v4();
        user.language = 'en';
      }

      user.github_id = profile.id;
      user.email = (!user.email && profile.emails.length >= 1) ? profile.emails[0].value : user.email;
      user.name = replaceName(user.name ? user.name : profile.displayName, user.email);
      user.username = replaceName(user.username ? user.username : profile.username, user.email);

      return user.save();
    }).then((user) => {
      callback(undefined, user);
    })
      .catch((err) => {
        callback(err);
      });
  }));

  router.get('/github', saveReturnTo, asyncErrorWrapper(passport.authenticate('github')));
  router.get('/github/callback', asyncErrorWrapper(passport.authenticate('github')), authenticated);
}
else {
  logger.error('GitHub login is not available, set a client id & secret');
}

if (config.gitlab.clientID && config.gitlab.clientSecret) {
  passport.use(new GitLabStrategy({
    clientID: config.gitlab.clientID,
    clientSecret: config.gitlab.clientSecret,
    callbackURL: `${config.server.host}/auth/gitlab/callback`,
  }, (accessToken: string, refreshToken: string, profile: PassportProfile, callback: GenericCallback) => {
    User.findOne({ gitlab_id: profile.id }).then((user) => {
      const emails = profile.emails.map((email: { value: string }) => email.value);

      if (!user && emails.length > 0) {
        return User.findOne({ email: { $in: emails } }).then((emailUser) => emailUser);
      }

      return user;
    }).then((existing) => {
      let user = existing;
      if (!user) {
        user = new User();
        user.apikey = v4();
        user.language = 'en';
      }

      user.gitlab_id = profile.id;
      user.email = (!user.email && profile.emails.length > 0) ? profile.emails[0].value : user.email;
      user.name = replaceName(user.name ? user.name : profile.displayName, user.email);
      user.username = replaceName(user.username ? user.username : profile.username, user.email);

      return user.save();
    }).then((user) => {
      callback(undefined, user);
    })
      .catch((err) => {
        callback(err);
      });
  }));

  router.get('/gitlab', saveReturnTo, asyncErrorWrapper(passport.authenticate('gitlab')));
  router.get('/gitlab/callback', asyncErrorWrapper(passport.authenticate('gitlab')), authenticated);
}
else {
  logger.error('GitLab login is not available, set a client id & secret');
}

router.get('/me', asyncErrorWrapper((req: Request, res: Response) => {
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
}));

router.get('/logout', asyncErrorWrapper((req: Request, res: Response) => {
  req.logout();
  res.redirect('/');
}));

export default router;
