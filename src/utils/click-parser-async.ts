import parse from 'click-parser';

// TODO fix types
export function parsePackage(file: string, getIcon: boolean): Promise<{ [key: string]: any }> {
  return new Promise((resolve, reject) => {
    parse(file, getIcon,
      (err, data) => {
      if (err) {
        reject(err);
      }
      else {
        resolve(data);
      }
    });
  });
}
