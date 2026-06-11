import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ulid } from 'ulid'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = join(__dirname, '../../uploads')

export function saveFile(buffer: Buffer, originalName: string): string {
  const ext = extname(originalName)
  const storedAs = `${ulid()}${ext}`
  writeFileSync(join(UPLOADS_DIR, storedAs), buffer)
  return storedAs
}

export function getFilePath(storedAs: string): string {
  return join(UPLOADS_DIR, storedAs)
}

export function deleteFile(storedAs: string): void {
  const p = join(UPLOADS_DIR, storedAs)
  if (existsSync(p)) unlinkSync(p)
}
