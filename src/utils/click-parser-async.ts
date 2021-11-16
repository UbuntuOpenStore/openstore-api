// @ts-ignore
import parse from 'click-parser';

import { ClickParserData } from './types';

export function parsePackage(file: string, getIcon: boolean): Promise<ClickParserData> {
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
