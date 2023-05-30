// @ts-ignore
import parse from 'click-parser';

import { type ClickParserData } from './types';

export function parseClickPackage(file: string, getIcon: boolean): Promise<ClickParserData> {
  return new Promise((resolve, reject) => {
    parse(file, getIcon,
      (err: any, data: ClickParserData) => {
        if (err) {
          reject(err);
        }
        else {
          resolve(data);
        }
      });
  });
}
