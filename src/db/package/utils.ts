import * as reviewPackage from 'utils/review-package';
import { NEEDS_MANUAL_REVIEW } from 'utils/error-messages';
import { UserError } from 'exceptions';

export async function clickReview(filePath: string) {
  const needsManualReview = await reviewPackage.reviewPackage(filePath);
  if (needsManualReview) {
    // TODO improve this feedback
    let reviewError = NEEDS_MANUAL_REVIEW;
    if (needsManualReview === true) {
      reviewError = `${NEEDS_MANUAL_REVIEW}, please check your app using the click-review command`;
    }
    else {
      reviewError = `${NEEDS_MANUAL_REVIEW} (Error: ${needsManualReview})`;
    }

    throw new UserError(reviewError);
  }
}
