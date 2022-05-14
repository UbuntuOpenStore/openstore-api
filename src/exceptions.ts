/* eslint-disable max-classes-per-file */

export class HttpError extends Error {
  httpCode = 500;
}

export class UserError extends HttpError {
  httpCode = 400;
}

export class AuthenticationError extends HttpError {
  httpCode = 401;
}

export class AuthorizationError extends HttpError {
  httpCode = 403;
}

export class NotFoundError extends HttpError {
  httpCode = 404;
}
