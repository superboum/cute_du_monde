const express = require('express')
const multer  = require('multer')
const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('nanimaux.db')
const upload = multer({ dest: 'public/uploads/' })

const app = express()
const port = 3000
app.set('view engine', 'pug')
app.use(express.static('public'))

const K = 40
const EloRes = {"win": 1, "loose": 0, "draw": 0.5}

const prediction = (player, adversary, ds) =>
  1 / (1 + Math.pow(10, ((ds[adversary].cote - ds[player].cote) / 400)))

const nouvelle_cote = (player, adversary, resultat, ds) =>
  ds[player].cote + K * (EloRes[resultat] - prediction(player, adversary, ds))

app.get('/init', (req, res) => {
  db.run(
    "CREATE TABLE cote (name TEXT, cote INTEGER, pic TEXT)", 
    err => res.redirect('/'))
})

app.get('/', (req, res) => {
  db.all(
    "SELECT * FROM cote ORDER BY RANDOM() LIMIT 2",
    (err, rows) => {
      console.log(rows)
      res.render('index', {choix: rows})
    })
})

const maj_cote = (name, cote) => 
  new Promise((resolve, reject) => 
    db.run("UPDATE cote SET cote = ? WHERE name = ?", cote, name, err =>
      err ? reject(err) : resolve()))

app.get('/vote/win/:winner/loose/:looser', (req, res) => { 
  const [winner, looser] = [req.params.winner, req.params.looser]

  db.all(
    "SELECT * FROM cote WHERE name = ? or name = ?",
    winner, looser, (err, rows) => {
      const ds = rows.reduce((acc, v) => {acc[v.name] = v; return acc}, {})
      
      const win_cote = nouvelle_cote(winner, looser, "win", ds)
      const loose_cote = nouvelle_cote(looser, winner, "loose", ds)
      
      Promise.all([maj_cote(winner, win_cote), maj_cote(looser, loose_cote)])
        .then(() => res.redirect('/'))
        .catch(err => { console.error(err); res.redirect('/') })
    })
})

app.post('/add', upload.single('photo'), (req, res) => {
  console.log(req.body.nom, req.file.path)
  db.run(
    "INSERT INTO cote VALUES (?, ?, ?)",
    req.body.nom, 1500, req.file.path, err => {
      res.redirect('/')
    })
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
