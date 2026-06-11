import { sqlite } from '../src/lib/db'

sqlite.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    id UNINDEXED,
    title,
    content,
    content='notes',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, id, title, content)
    VALUES (new.rowid, new.id, new.title, new.content);
  END;

  CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, id, title, content)
    VALUES ('delete', old.rowid, old.id, old.title, old.content);
    INSERT INTO notes_fts(rowid, id, title, content)
    VALUES (new.rowid, new.id, new.title, new.content);
  END;

  CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, id, title, content)
    VALUES ('delete', old.rowid, old.id, old.title, old.content);
  END;
`)

console.log('FTS5 setup complete')
