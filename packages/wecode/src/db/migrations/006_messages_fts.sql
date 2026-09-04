CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  search_text,
  role,
  session_id UNINDEXED,
  message_id UNINDEXED,
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages
WHEN NEW.search_text IS NOT NULL AND NEW.search_text != ''
BEGIN
  INSERT INTO messages_fts(search_text, role, session_id, message_id)
  VALUES (NEW.search_text, NEW.role, NEW.session_id, NEW.entry_id);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages
BEGIN
  DELETE FROM messages_fts WHERE message_id = OLD.entry_id;
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE OF search_text, role ON messages
BEGIN
  DELETE FROM messages_fts WHERE message_id = OLD.entry_id;
  INSERT INTO messages_fts(search_text, role, session_id, message_id)
  SELECT NEW.search_text, NEW.role, NEW.session_id, NEW.entry_id
  WHERE NEW.search_text IS NOT NULL AND NEW.search_text != '';
END;

INSERT INTO messages_fts(search_text, role, session_id, message_id)
SELECT search_text, role, session_id, entry_id FROM messages
WHERE search_text IS NOT NULL AND search_text != '';
