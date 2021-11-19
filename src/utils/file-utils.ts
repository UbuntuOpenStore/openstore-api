import fs from 'fs/promises';

export async function moveFile(src: string, dest: string) {
  await fs.copyFile(src, dest);
  await fs.unlink(src);
}
