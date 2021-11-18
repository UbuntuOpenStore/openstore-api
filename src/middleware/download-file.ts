import path from 'path';
import { Request, Response, NextFunction } from 'express';
import fs from 'fs';

import { error, download } from 'utils/helpers';
import config from 'utils/config';

export function downloadFile(req: Request, res: Response, next: NextFunction) {
  if (!req.file && req.body && req.body.downloadUrl) {
    let filename = path.basename(req.body.downloadUrl);

    // Strip extra hashes & params
    if (filename.indexOf('?') >= 0) {
      filename = filename.substring(0, filename.indexOf('?'));
    }

    if (filename.indexOf('#') >= 0) {
      filename = filename.substring(0, filename.indexOf('#'));
    }

    download(req.body.downloadUrl, `${config.data_dir}/${filename}`).then((tmpfile) => {
      req.files = {
        file: [{
          originalname: filename,
          path: tmpfile,
          size: fs.statSync(tmpfile).size,
        } as any],
      };
      next();
    }).catch(() => {
      error(res, 'Failed to download remote file', 400);
    });
  }
  else {
    next();
  }
}
