import { Peer } from 'peerjs';

/** Just a Peer -- a wrapper for Peer js's functionality, preferring promises */
export default class PeerConnector {
	constructor(peerId) {
		this.peerId = peerId;
		this.peer = null;
		this.incomingConnections = [];
		this.outgoingConnections = [];
		this.eventHandlers = {};
	}

	async start(handlers = {}) {
		await this.stop();
		this.eventHandlers = handlers;
		await this.makePeer();
	}

	async stop() {
		this.peer?.destroy();
		// const connClosePromises = this.getAllConnections().map((conn) => {
		// return new Promise((resolve, reject) => {
		// conn.on('close', resolve);
		// conn.on('error', reject);
		// conn.close();
		// });
		// });
		// await Promise.allSettled(connClosePromises);
	}

	getAllConnections() {
		return [...this.incomingConnections, ...this.outgoingConnections];
	}

	async makePeer() {
		this.peer = null;
		console.log('Making peer', this.peerId);
		const peer = new Peer(this.peerId, { debug: 2 });
		peer.on('open', () => {
			console.log('Opened', peer.id);
			this.peerId = peer.id;
		});
		peer.on('connection', (conn) => {
			this.incomingConnections.push(conn);
			console.log('Incoming Peer connection', conn);
			conn.on('open', (...args) => {
				// console.log('Incoming connection open');
				this.eventHandlers?.onIncomingOpen(conn, args);
			});
			conn.on('data', (data) => {
				// Will print 'hi!'
				// console.log('Data from a connector:', data);
				this.eventHandlers?.onData(data, conn, 'IN');
			});
			conn.on('close', () => {
				const i = this.incomingConnections.findIndex((c) => c === conn);
				this.incomingConnections.splice(i, 1);
				this.eventHandlers?.onIncomingClose(conn);
			});
			conn.on('error', () => console.warn('Connection error'));
		});
		peer.on('close', () => console.log('Closed'));
		peer.on('disconnect', () => {
			console.log('Disconnected');
		});
		peer.on('error', (...args) => console.warn('Error', args));
		const promise = new Promise((resolve, reject) => {
			peer.on('open', () => {
				console.log('Opened');
				resolve(peer);
			});
			peer.on('error', (...args) => {
				console.warn('Error', args);
				reject();
			});
		});
		this.peer = await promise;
		return peer;
	}

	async connectTo(peerId) {
		const connectPromise = new Promise((resolve, reject) => {
			console.log('Trying to connect to host', peerId);
			const conn = this.peer.connect(peerId);
			conn.on('open', () => {
				console.log('Out-going connection open');
				resolve(conn);
			});
			conn.on('data', (data) => {
				// console.log('Data from out-going connection', peerId, data);
				this.eventHandlers?.onData(data, peerId, conn, 'OUT');
			});
			conn.on('error', () => {
				reject();
			});
		});
		const connection = await connectPromise;
		this.outgoingConnections.push(connection);
		return connection;
	}

	send(data, who) {
		if (!who) {
			this.getAllConnections().forEach((conn) => {
				if (!conn.open) {
					// console.warn('Cannot send data because connection is not open yet.', this.peerId);
					return;
				}
				conn.send(data);
			});
			return;
		}
		console.warn('TODO - send to just one peer');
		// TODO: Just send to one peerId?
	}
}
