import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { join, extname, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const UPLOADS_DIR = join(process.cwd(), 'uploads')

export function saveFile(buffer: Buffer, originalName: string): string {
  const ext = extname(originalName)
  const storedAs = `${randomUUID()}${ext}`
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
