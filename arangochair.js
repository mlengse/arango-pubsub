const axios = require('axios')

const EventEmitter = require('events');

const mapTextToType = {
		'insert/update':'2300',
		'delete':'2302'
};
const mapTypeToText = {
		'2300': 'insert/update',
		'2302': 'delete'
};

module.exports = class ArangoChair extends EventEmitter {
		constructor({ host, port, database, username, password }) {
				super();
				this.username = username
				this.password = password

				axios.defaults.baseURL = `${host}:${port}`
				this.axios = axios

				this._loggerStatePath  = `/_db/${database}/_api/replication/logger-state`;
				this._loggerFollowPath = `/_db/${database}/_api/replication/logger-follow`;

				this.collectionsMap = new Map();
				this._stopped = false;
		}

		async start() {
				this._stopped = false;
				await this._startLoggerState();
		}

		stop() {
				this._stopped = true;
		}

		async _startLoggerState() {
			let { data: { jwt }} = await this.axios.post('/_open/auth', {
				username: this.username,
				password: this.password
			})
			// this.jwt = jwt

			this.axios.defaults.headers.common = {'Authorization': `bearer ${jwt}`}

			let { status, headers, data: body } = await this.axios.get(this._loggerStatePath)
			if (200 !== status) {
					this.emit('error', new Error('E_LOGGERSTATE'), status, headers, data);
					this.stop();
					return;
			} // if

			let lastLogTick = body.state.lastLogTick;
			let start = 0;
			let idx   = 0;

			let type  = 0;
			let tid   = 0;
			let entry = 0;

			let typeStartIdx = 0;
			let typeEndIdx   = 0;
			let idx0 = 0;
			let idx1 = 0;

			const typeStartBuffer       = Buffer.from('type":');
			const cnameStartBuffer      = Buffer.from('cname":"');
			const keyStartBuffer        = Buffer.from('_key":"');
			const commaDoubleTickBuffer = Buffer.from(',"');

			const txns = new Map();

			const handleEntry = () => {
				idx0 = entry.indexOf(cnameStartBuffer, idx0 + 2) + 8;
				idx1 = entry.indexOf(commaDoubleTickBuffer, idx0) - 1;

				const colName = entry.slice(idx0, idx1).toString();

				const colConf = this.collectionsMap.get(colName);
				if (undefined === colConf) return;

				const events = colConf.get('events');

				if (0 !== events.size && !events.has(type)) return;

				idx0 = entry.indexOf(keyStartBuffer, idx1 + 9);
				const key = entry.slice(idx0+7, entry.indexOf(commaDoubleTickBuffer, idx0+7)-1).toString();
				const keys = colConf.get('keys');

				if (0 !== keys.size && !events.has(key)) return;

				this.emit(colName, entry.slice(idx1 + 9, -1), mapTypeToText[type]);
			};

			const ticktock = async () => {
				if (this._stopped) return;

				let { status, headers, data: body } = await this.axios.get(`${this._loggerFollowPath}?from=${lastLogTick}`)

				if (204 < status || 0 === status) {
					this.emit('error', new Error('E_LOGGERFOLLOW'), status, headers, body);
					this.stop();
					return;
				} // if

				if ('0' === headers['x-arango-replication-lastincluded']) {
					return setTimeout(ticktock, 500);
				} // if

				lastLogTick = headers['x-arango-replication-lastincluded'];

				start = idx = 0;
				while(true) {
					idx = body.indexOf('\n', start);
					if (-1 === idx) break;

					entry = body.slice(start, idx);
					start = idx+1;

					idx0 = entry.indexOf(typeStartBuffer) + 6;            // find type":
					idx1 = entry.indexOf(commaDoubleTickBuffer, idx0);    // find ,"
					type = entry.slice(idx0, idx1).toString();

					idx0 = entry.indexOf(commaDoubleTickBuffer, idx1+8) - 1; // find ,"
					tid  = entry.slice(idx1+8, idx0).toString();

					if ('2200' === type) { // txn start
						txns.set(tid, new Set());

					} else if ('2201' === type) { // txn commit and replay docs
						for(const data of txns.get(tid)) {
							idx0 = 0;
							[type, entry] = data;
							handleEntry();
						} // for
						txns.delete(tid);

					} else if ('2002' === type) { // txn abort
						txns.delete(tid);

					} else {
						if ('2300' !== type && '2302' !== type) continue;

						if ('0' !== tid) {
							txns.get(tid).add([type,entry.slice(idx0+14)]);
							continue;
						} // if

						handleEntry();
					} // else
				}
				
				await ticktock();
			}

			await ticktock();
		}

		subscribe(confs) {
				if ('string' === typeof confs) confs = {collection:confs};
				if (!Array.isArray(confs))     confs = [confs];

				for(const conf of confs) {
						let colConfMap = undefined;
						if (this.collectionsMap.has(conf.collection)) {
								colConfMap = this.collectionsMap.get(conf.collection);
						} else {
								colConfMap = new Map([ ['events', new Set()],['keys', new Set()] ]);
								this.collectionsMap.set(conf.collection, colConfMap);
						}

						if (conf.events) {
								for(const event of conf.events) {
										colConfMap.get('events').add(mapTextToType[event]);
								} // for
						} // if
						if (conf.keys) {
								for(const key of conf.keys) {
										colConfMap.get('keys').add(key);
								} // for
						} // if
				} // for
		} // subscribe()

		unsubscribe(confs) {
				if ('string' === typeof confs) confs = {collection:confs};
				if (!Array.isArray(confs))     confs = [confs];

				for(const conf of confs) {
						if (conf.events) {
								const events = this.collectionsMap.get(conf.collection).get('events');
								for(const event of conf.events) {
										events.delete(mapTextToType[event]);
								} // for
						} // if
						if (conf.keys) {
								const keys = this.collectionsMap.get(conf.collection).get('keys');
								for(const key of conf.keys) {
										keys.delete(key);
								} // for
						}// if

						if (!conf.events && !conf.keys) {
								this.collectionsMap.delete(conf.collection);
						} // if
				} // for
		} // unsubscribe()
}

