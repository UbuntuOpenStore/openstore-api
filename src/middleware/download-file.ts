import path from 'path';
import { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import axios from 'axios';

import { error, config, captureException } from 'utils';

export async function downloadFile(req: Request, res: Response, next: NextFunction) {
  if (!req.file && req.body && req.body.downloadUrl) {
    let filename = path.basename(req.body.downloadUrl);

    // Strip extra hashes & params
    if (filename.includes('?')) {
      filename = filename.substring(0, filename.indexOf('?'));
    }

    if (filename.includes('#')) {
      filename = filename.substring(0, filename.indexOf('#'));
    }

    const response = await axios.get(req.body.downloadUrl, { responseType: 'stream' });
    if (response.status === 200) {
      const tmpfile = `${config.data_dir}/${filename}`;
      const writer = fs.createWriteStream(tmpfile);

      writer.on('error', (err) => {
        captureException(err, req.originalUrl);
        error(res, 'Failed to download remote file', 400);
      });

      writer.on('finish', () => {
        req.files = {
          file: [{
            originalname: filename,
            path: tmpfile,
            size: fs.statSync(tmpfile).size,
          } as any],
        };
        next();
      });

      response.data.pipe(writer);
    }
    else {
      error(res, 'Failed to download remote file', 400);
    }
  }
  else {
    next();
  }
}
