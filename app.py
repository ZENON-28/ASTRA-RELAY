from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3, time

app = Flask(__name__)
CORS(app)
DB = 'astra_relay.db'

def init_db():
    with sqlite3.connect(DB) as db:
        db.execute('CREATE TABLE IF NOT EXISTS packets (id TEXT PRIMARY KEY, type TEXT, priority INTEGER, size INTEGER, status TEXT, retries INTEGER, created_at REAL)')
        db.execute('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, category TEXT, severity TEXT, description TEXT)')
init_db()

@app.get('/api/mission/status')
def mission_status():
    return jsonify({'missionId':'AR-07','status':'ACTIVE','mode':'AUTONOMOUS','link':'LINKED','mqtt':'SIMULATED','health':'OPERATIONAL'})

@app.get('/api/packets')
def packets():
    with sqlite3.connect(DB) as db:
        rows=db.execute('SELECT id,type,priority,size,status,retries,created_at FROM packets ORDER BY created_at DESC').fetchall()
    return jsonify([dict(zip(['id','type','priority','size','status','retries','createdAt'],r)) for r in rows])

@app.get('/api/queue')
def queue():
    with sqlite3.connect(DB) as db:
        count=db.execute("SELECT COUNT(*) FROM packets WHERE status != 'DELIVERED'").fetchone()[0]
    return jsonify({'queueDepth':count})

@app.get('/api/events')
def events():
    with sqlite3.connect(DB) as db:
        rows=db.execute('SELECT time,category,severity,description FROM events ORDER BY id DESC LIMIT 100').fetchall()
    return jsonify([dict(zip(['time','category','severity','description'],r)) for r in rows])

@app.post('/api/packets/generate')
def generate():
    body=request.get_json(silent=True) or {}
    packet_type=body.get('type','TELEMETRY')
    counter=int(time.time()*1000)%1000000
    packet={'id':f'AR07-PKT-{counter:06d}','type':packet_type,'priority':100 if packet_type=='EMERGENCY' else 32,'size':48,'status':'QUEUED','retries':0,'createdAt':time.time()}
    with sqlite3.connect(DB) as db:
        db.execute('INSERT OR IGNORE INTO packets VALUES (?,?,?,?,?,?,?)',(packet['id'],packet_type,packet['priority'],48,'QUEUED',0,packet['createdAt']))
    return jsonify(packet),201

@app.post('/api/simulation/<action>')
def simulation(action):
    return jsonify({'action':action,'accepted':True,'mode':'SIMULATION'})

if __name__=='__main__':
    app.run(host='0.0.0.0',port=5000,debug=False)
