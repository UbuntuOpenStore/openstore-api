export enum Ratings {
  THUMBS_UP = 'THUMBS_UP',
  THUMBS_DOWN = 'THUMBS_DOWN',
  HAPPY = 'HAPPY',
  NEUTRAL = 'NEUTRAL',
  BUGGY = 'BUGGY',
}

export const RATINGS = [
  'THUMBS_UP',
  'THUMBS_DOWN',
  'HAPPY',
  'NEUTRAL',
  'BUGGY',
];

export const REVIEW_MAX_LEN = 512;

export const RATING_MAP = {
  THUMBS_UP: 1,
  THUMBS_DOWN: -1,
  HAPPY: 1,
  NEUTRAL: 0,
  BUGGY: -1,
};
