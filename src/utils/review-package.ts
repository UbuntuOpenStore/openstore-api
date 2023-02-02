import childProcess from 'child_process';
import { UserError } from 'exceptions';

import { config } from './config';
import { captureException } from './logger';

export type ReviewData = {
  [group: string]: {
    error: {
      [check: string]: {
        manual_review: boolean;
        text: string;
      };
    };
    warn: {
      [check: string]: {
        manual_review: boolean;
        text: string;
      };
    };
    info: {
      [check: string]: {
        manual_review: boolean;
        text: string;
      };
    };
  }
}

export type ReviewSummary = {
  manualReviewMessages: string[];
  errorMessages: string[];
  warningMessages: string[];
}

export function clickReview(file: string): Promise<ReviewSummary> {
  return new Promise((resolve, reject) => {
    const command = `${config.clickreview.command} --json ${file}`;
    childProcess.exec(command, {
      env: {
        PYTHONPATH: config.clickreview.pythonpath,
      },
    }, (err, stdout, stderr) => {
      let reviewData: ReviewData;
      try {
        reviewData = JSON.parse(stdout);
      }
      catch (e) {
        console.error(stdout, stderr, err);
        captureException(e, '');
        reject(new UserError('Unable to process the click for review'));
        return;
      }

      const manualReviewMessages: string[] = [];
      const errorMessages: string[] = [];
      const warningMessages: string[] = [];

      Object.values(reviewData).forEach((groupData) => {
        Object.values(groupData.error).forEach((error) => {
          if (error.manual_review) {
            manualReviewMessages.push(error.text.replace('(NEEDS REVIEW)', '').trim());
          }
          else {
            errorMessages.push(error.text.trim());
          }
        });

        Object.values(groupData.warn).forEach((warn) => {
          if (warn.manual_review) {
            manualReviewMessages.push(warn.text.replace('(NEEDS REVIEW)', '').trim());
          }
          else {
            warningMessages.push(warn.text.trim());
          }
        });
      });

      resolve({
        manualReviewMessages,
        errorMessages,
        warningMessages,
      });
    });
  });
}
