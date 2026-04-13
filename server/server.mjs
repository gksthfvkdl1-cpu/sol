import express from 'express'
import cors from 'cors'
import initSqlJs from 'sql.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3001)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-in-production'
const JWT_EXPIRES = '24h'

const dataDir = path.join(__dirname, 'data')
const dbPath = process.env.DB_PATH || path.join(dataDir, 'app.db')
fs.mkdirSync(dataDir, { recursive: true })

const wasmDir = path.join(__dirname, 'node_modules', 'sql.js', 'dist')
const SQL = await initSqlJs({
  locateFile: (file) => path.join(wasmDir, file),
})

let db
if (fs.existsSync(dbPath)) {
  db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)))
} else {
  db = new SQL.Database()
}

function saveDb() {
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

function run(sql, params = []) {
  db.run(sql, params)
  saveDb()
}

function getOne(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const ok = stmt.step()
  const row = ok ? stmt.getAsObject() : null
  stmt.free()
  return row
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

function lastId() {
  const r = getOne('SELECT last_insert_rowid() AS id')
  return r ? Number(r.id) : 0
}

function issueSession(user) {
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES })
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name || user.username,
    },
  }
}

function initDb() {
  run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT ''
    );
  `)
  run(`
    CREATE TABLE IF NOT EXISTS matchups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      defense1 TEXT NOT NULL,
      defense2 TEXT NOT NULL,
      defense3 TEXT NOT NULL,
      attack1 TEXT NOT NULL,
      attack2 TEXT NOT NULL,
      attack3 TEXT NOT NULL,
      skill_order TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      win INTEGER NOT NULL DEFAULT 0,
      lose INTEGER NOT NULL DEFAULT 0,
      author_id INTEGER NOT NULL,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );
  `)
  run(
    'CREATE INDEX IF NOT EXISTS idx_matchups_def ON matchups(defense1, defense2, defense3);',
  )
  run(`
    CREATE TABLE IF NOT EXISTS matchup_edit_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matchup_id INTEGER NOT NULL,
      requester_id INTEGER NOT NULL,
      skill_order TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (matchup_id) REFERENCES matchups(id),
      FOREIGN KEY (requester_id) REFERENCES users(id)
    );
  `)
  run(`
    CREATE TABLE IF NOT EXISTS signup_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const { c } = getOne('SELECT COUNT(*) AS c FROM users') || { c: 0 }
  if (Number(c) === 0) {
    const hash = bcrypt.hashSync('test123', 10)
    run('INSERT INTO users (username, password_hash, display_name) VALUES (?,?,?)', [
      'test',
      hash,
      '아기수룡',
    ])
    const uid = lastId()
    run(
      `INSERT INTO matchups (
        defense1, defense2, defense3, attack1, attack2, attack3, skill_order, notes, win, lose, author_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        '라드그리드',
        '손오공',
        '엘리시아',
        '라드그리드',
        '에이스',
        '손오공',
        '라드1 -> 손오공2 -> 에이스1',
        '모의전',
        56,
        15,
        uid,
      ],
    )
    run(
      `INSERT INTO matchups (
        defense1, defense2, defense3, attack1, attack2, attack3, skill_order, notes, win, lose, author_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        '라드그리드',
        '손오공',
        '엘리시아',
        '엘리시아',
        '라델',
        '팬',
        '라델 스킬 우선',
        '장비 맞추고 진행. 영웅 레벨 균형 유지 권장.',
        12,
        3,
        uid,
      ],
    )
  }

  const adminHash = bcrypt.hashSync('gksthf', 10)
  run(`INSERT OR IGNORE INTO users (username, password_hash, display_name) VALUES (?,?,?)`, [
    'admin',
    adminHash,
    '관리자',
  ])
  run('UPDATE users SET password_hash = ?, display_name = ? WHERE username = ?', [
    adminHash,
    '관리자',
    'admin',
  ])
}

initDb()

const app = express()
app.use(cors({ origin: true }))
app.use(express.json({ limit: '2mb' }))

function authMiddleware(req, res, next) {
  const h = req.headers.authorization
  const token =
    typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!token) {
    return res.status(401).json({ error: '로그인이 필요합니다.' })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = Number(payload.sub)
    next()
  } catch {
    return res.status(401).json({ error: '세션이 만료되었습니다. 다시 로그인하세요.' })
  }
}

function requireAdmin(req, res, next) {
  const row = getOne('SELECT username FROM users WHERE id = ?', [req.userId])
  if (!row || row.username !== 'admin') {
    return res.status(403).json({ error: '관리자만 접근할 수 있습니다.' })
  }
  next()
}

app.post('/api/auth/signup-request', (req, res) => {
  const username = String(req.body?.username ?? '').trim()
  const password = String(req.body?.password ?? '')
  const displayName = String(req.body?.displayName ?? '').trim()
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: '아이디, 비밀번호, 닉네임을 입력하세요.' })
  }
  if (username.length < 2) {
    return res.status(400).json({ error: '아이디는 2자 이상이어야 합니다.' })
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' })
  }
  if (username.toLowerCase() === 'admin') {
    return res.status(400).json({ error: '사용할 수 없는 아이디입니다.' })
  }
  const takenUser = getOne('SELECT id FROM users WHERE username = ?', [username])
  if (takenUser) {
    return res.status(409).json({ error: '이미 가입된 아이디입니다.' })
  }
  const pending = getOne('SELECT id FROM signup_requests WHERE username = ?', [username])
  if (pending) {
    return res.status(409).json({ error: '이미 가입 신청이 접수된 아이디입니다.' })
  }
  const password_hash = bcrypt.hashSync(password, 10)
  run('INSERT INTO signup_requests (username, password_hash, display_name) VALUES (?,?,?)', [
    username,
    password_hash,
    displayName,
  ])
  res.status(201).json({ ok: true })
})

app.get('/api/admin/signup-requests', authMiddleware, requireAdmin, (_req, res) => {
  const rows = getAll(
    'SELECT id, username, display_name, created_at FROM signup_requests ORDER BY id ASC',
  )
  res.json(rows)
})

app.get('/api/admin/edit-requests', authMiddleware, requireAdmin, (_req, res) => {
  const rows = getAll(
    `SELECT
      r.id,
      r.matchup_id,
      r.skill_order,
      r.notes,
      r.created_at,
      u.username AS requester_username,
      u.display_name AS requester_display_name,
      m.defense1,
      m.defense2,
      m.defense3
     FROM matchup_edit_requests r
     JOIN users u ON u.id = r.requester_id
     JOIN matchups m ON m.id = r.matchup_id
     WHERE r.status = 'pending'
     ORDER BY r.id ASC`,
  )
  res.json(rows)
})

app.post('/api/admin/signup-requests/:id/approve', authMiddleware, requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const row = getOne('SELECT * FROM signup_requests WHERE id = ?', [id])
  if (!row) {
    return res.status(404).json({ error: '없는 신청입니다.' })
  }
  const exists = getOne('SELECT id FROM users WHERE username = ?', [row.username])
  if (exists) {
    run('DELETE FROM signup_requests WHERE id = ?', [id])
    return res.status(409).json({ error: '이미 가입된 아이디입니다. 신청만 삭제했습니다.' })
  }
  run('INSERT INTO users (username, password_hash, display_name) VALUES (?,?,?)', [
    row.username,
    row.password_hash,
    row.display_name,
  ])
  run('DELETE FROM signup_requests WHERE id = ?', [id])
  res.json({ ok: true })
})

app.post('/api/admin/signup-requests/:id/reject', authMiddleware, requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const row = getOne('SELECT id FROM signup_requests WHERE id = ?', [id])
  if (!row) {
    return res.status(404).json({ error: '없는 신청입니다.' })
  }
  run('DELETE FROM signup_requests WHERE id = ?', [id])
  res.json({ ok: true })
})

app.post('/api/admin/edit-requests/:id/approve', authMiddleware, requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const row = getOne(
    'SELECT id, matchup_id, skill_order, notes, status FROM matchup_edit_requests WHERE id = ?',
    [id],
  )
  if (!row || String(row.status) !== 'pending') {
    return res.status(404).json({ error: '없는 수정 신청입니다.' })
  }
  run('UPDATE matchups SET skill_order = ?, notes = ? WHERE id = ?', [
    String(row.skill_order || '').trim(),
    String(row.notes || '').trim(),
    Number(row.matchup_id),
  ])
  run('UPDATE matchup_edit_requests SET status = ? WHERE id = ?', ['approved', id])
  res.json({ ok: true })
})

app.post('/api/admin/edit-requests/:id/reject', authMiddleware, requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  const row = getOne('SELECT id, status FROM matchup_edit_requests WHERE id = ?', [id])
  if (!row || String(row.status) !== 'pending') {
    return res.status(404).json({ error: '없는 수정 신청입니다.' })
  }
  run('UPDATE matchup_edit_requests SET status = ? WHERE id = ?', ['rejected', id])
  res.json({ ok: true })
})

app.post('/api/auth/login', (req, res) => {
  const username = String(req.body?.username ?? '').trim()
  const password = String(req.body?.password ?? '')
  if (!username || !password) {
    return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' })
  }
  const user = getOne('SELECT id, username, password_hash, display_name FROM users WHERE username = ?', [
    username,
  ])
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res
      .status(401)
      .json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' })
  }
  res.json(issueSession(user))
})

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = getOne('SELECT id, username, display_name FROM users WHERE id = ?', [
    req.userId,
  ])
  if (!user) return res.status(404).json({ error: '사용자 없음' })
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
  })
})

app.get('/api/meta/heroes', (_req, res) => {
  const rows = getAll(
    `SELECT DISTINCT name FROM (
        SELECT defense1 AS name FROM matchups
        UNION SELECT defense2 FROM matchups
        UNION SELECT defense3 FROM matchups
      ) WHERE TRIM(name) != '' ORDER BY name COLLATE NOCASE`,
  )
  res.json(rows.map((r) => r.name))
})

app.post('/api/matchups/search', (req, res) => {
  const d1 = String(req.body?.defense1 ?? '').trim()
  const d2 = String(req.body?.defense2 ?? '').trim()
  const d3 = String(req.body?.defense3 ?? '').trim()
  const exclude = Array.isArray(req.body?.exclude)
    ? req.body.exclude.map((x) => String(x).trim()).filter(Boolean)
    : []

  let sql = `SELECT m.*, u.display_name AS author_name, u.username AS author_username
    FROM matchups m JOIN users u ON u.id = m.author_id WHERE 1=1`
  const params = []
  if (d1) {
    sql += ' AND m.defense1 LIKE ?'
    params.push(`%${d1}%`)
  }
  if (d2) {
    sql += ' AND m.defense2 LIKE ?'
    params.push(`%${d2}%`)
  }
  if (d3) {
    sql += ' AND m.defense3 LIKE ?'
    params.push(`%${d3}%`)
  }
  sql += ' ORDER BY (m.win + m.lose) DESC, m.win DESC'

  let rows = getAll(sql, params)
  for (const t of exclude) {
    rows = rows.filter(
      (r) =>
        !String(r.attack1).includes(t) &&
        !String(r.attack2).includes(t) &&
        !String(r.attack3).includes(t),
    )
  }
  res.json(rows)
})

app.post('/api/matchups', authMiddleware, (req, res) => {
  const b = req.body || {}
  const defense1 = String(b.defense1 ?? '').trim()
  const defense2 = String(b.defense2 ?? '').trim()
  const defense3 = String(b.defense3 ?? '').trim()
  const attack1 = String(b.attack1 ?? '').trim()
  const attack2 = String(b.attack2 ?? '').trim()
  const attack3 = String(b.attack3 ?? '').trim()
  const skill_order = String(b.skill_order ?? '').trim()
  const notes = String(b.notes ?? '').trim()
  if (
    !defense1 ||
    !defense2 ||
    !defense3 ||
    !attack1 ||
    !attack2 ||
    !attack3
  ) {
    return res.status(400).json({ error: '방어·공격 6칸은 필수입니다.' })
  }
  run(
    `INSERT INTO matchups (
      defense1, defense2, defense3, attack1, attack2, attack3, skill_order, notes, win, lose, author_id
    ) VALUES (?,?,?,?,?,?,?,?,0,0,?)`,
    [
      defense1,
      defense2,
      defense3,
      attack1,
      attack2,
      attack3,
      skill_order,
      notes,
      req.userId,
    ],
  )
  const mid = lastId()
  const row = getOne(
    `SELECT m.*, u.display_name AS author_name, u.username AS author_username
     FROM matchups m JOIN users u ON u.id = m.author_id WHERE m.id = ?`,
    [mid],
  )
  res.status(201).json(row)
})

app.post('/api/matchups/:id/edit-request', authMiddleware, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: '유효하지 않은 공략 ID입니다.' })
  }
  const target = getOne('SELECT id FROM matchups WHERE id = ?', [id])
  if (!target) {
    return res.status(404).json({ error: '없는 공략입니다.' })
  }

  const skill_order = String(req.body?.skill_order ?? '').trim()
  const notes = String(req.body?.notes ?? '').trim()
  run(
    `INSERT INTO matchup_edit_requests (
      matchup_id, requester_id, skill_order, notes, status
    ) VALUES (?,?,?,?, 'pending')`,
    [id, req.userId, skill_order, notes],
  )
  res.status(201).json({ ok: true })
})

app.delete('/api/matchups/:id', authMiddleware, requireAdmin, (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: '유효하지 않은 공략 ID입니다.' })
  }
  const row = getOne('SELECT id FROM matchups WHERE id = ?', [id])
  if (!row) {
    return res.status(404).json({ error: '없는 공략입니다.' })
  }
  run('DELETE FROM matchup_edit_requests WHERE matchup_id = ?', [id])
  run('DELETE FROM matchups WHERE id = ?', [id])
  res.json({ ok: true })
})

app.post('/api/matchups/:id/vote', (req, res) => {
  const id = Number(req.params.id)
  const outcome = req.body?.outcome
  if (outcome !== 'win' && outcome !== 'lose') {
    return res.status(400).json({ error: 'outcome은 win 또는 lose' })
  }
  const col = outcome === 'win' ? 'win' : 'lose'
  db.run(`UPDATE matchups SET ${col} = ${col} + 1 WHERE id = ?`, [id])
  const n = db.getRowsModified()
  if (n === 0) {
    return res.status(404).json({ error: '없음' })
  }
  saveDb()
  const row = getOne('SELECT * FROM matchups WHERE id = ?', [id])
  res.json(row)
})

app.listen(PORT, () => {
  console.log(`SQLite (sql.js) API http://localhost:${PORT}`)
})
