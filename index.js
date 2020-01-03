const express = require('express')
const multer  = require('multer')
const sqlite3 = require('sqlite3').verbose()
const db = new sqlite3.Database('nanimaux.db')
const upload = multer({ dest: 'public/uploads/' })

const app = express()
const port = 3000

let ip_addr = {}
const vote_per_time_unit = 2
setInterval(() => ip_addr = {}, 1000*60*60*24)
const ip = req => req.headers['x-forwarded-for'] || req.connection.remoteAddress
const avail_vote = ip => ip in ip_addr ? vote_per_time_unit - ip_addr[ip] : vote_per_time_unit
const can_vote = ip => avail_vote(ip) > 0
const has_voted = ip => ip in ip_addr ? ip_addr[ip]++ : ip_addr[ip] = 1

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
      //console.log(rows)
      res.render('index', {choix: rows, remvote: avail_vote(ip(req))})
    })
})

const maj_cote = (name, cote) => 
  new Promise((resolve, reject) => 
    db.run("UPDATE cote SET cote = ? WHERE name = ?", cote, name, err =>
      err ? reject(err) : resolve()))

app.get('/vote/win/:winner/loose/:looser', (req, res) => { 
  const [winner, looser] = [req.params.winner, req.params.looser]
  if (!can_vote(ip(req))) {
    res.status(403).send('Vous ne pouvez plus voter aujourd\'hui !')
    return
  }

  db.all(
    "SELECT * FROM cote WHERE name = ? or name = ?",
    winner, looser, (err, rows) => {
      const ds = rows.reduce((acc, v) => {acc[v.name] = v; return acc}, {})
      
      const win_cote = nouvelle_cote(winner, looser, "win", ds)
      const loose_cote = nouvelle_cote(looser, winner, "loose", ds)
      
      Promise.all([maj_cote(winner, win_cote), maj_cote(looser, loose_cote)])
        .then(() => { has_voted(ip(req)); res.redirect('/') })
        .catch(err => { console.error(err); res.redirect('/') })
    })
})

app.get('/classement', (req, res) =>
  db.all('SELECT * FROM cote ORDER BY cote DESC LIMIT 50', (err, rows) =>
    res.render('classement', {classement: rows, erreurs: err })
  ))

app.get('/ajouter', (req, res) => res.render('ajouter', {}))

app.post('/ajouter', upload.single('photo'), (req, res) => {
  console.log("adding", req.body.nom, req.file.path)
  db.run(
    "INSERT INTO cote VALUES (?, ?, ?)",
    req.body.nom, 1500, req.file.path, err => {
      res.redirect('/')
    })
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
