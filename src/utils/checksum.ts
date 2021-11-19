import crypto from 'crypto';
import fs from 'fs';

export function sha512Checksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (data: string) => {
      hash.update(data, 'utf8');
    });

    stream.on('error', (err) => {
      reject(err);
    });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}
