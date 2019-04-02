const childProcess = require('child_process');

const config = require('./config');
const logger = require('./logger');

// TODO return the actual problem
function parseReview(reviewData) {
    let manualReview = false;

    Object.values(reviewData).forEach((rev) => {
        Object.values(rev).forEach((level) => {
            Object.values(level).forEach((label) => {
                if (label.manual_review) {
                    if (label.text.indexOf('OK') == -1) {
                        manualReview = label.text;
                        manualReview = manualReview.replace('(NEEDS REVIEW)', '');
                    }
                    else {
                        manualReview = true;
                    }
                }
            });
        });
    });

    return manualReview;
}

function review(file) {
    return new Promise((resolve) => {
        let command = `${config.clickreview.command} --json ${file}`;
        childProcess.exec(command, {
            env: {
                PYTHONPATH: config.clickreview.pythonpath,
            },
        }, (err, stdout, stderr) => {
            if (err) {
                logger.error(`Error processing package for review: ${err}`);
                if (stderr) {
                    logger.error(stderr);
                }

                // logger.error(stdout);

                let error = true;
                try {
                    let reviewData = JSON.parse(stdout);
                    error = parseReview(reviewData);
                    if (!error) {
                        /*
                        If we don't find a manual review flag, but this still
                        failed (for example, "Could not find compiled binaries
                        or architecture 'armhf'")
                        */
                        error = true;
                    }
                }
                catch (e) {
                    error = true;
                }

                resolve(error);
            }
            else {
                let reviewData = JSON.parse(stdout);

                resolve(parseReview(reviewData));
            }
        });
    });
}

exports.review = review;
