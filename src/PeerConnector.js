import { Peer } from 'peerjs';

/** Just a Peer -- a wrapper for Peer js's functionality, preferring promises */
export default class PeerConnector {
	constructor(peerId) {
		this.peerId = peerId;
		this.peer = null;
		this.incomingConnections = [];
		this.outgoingConnections = [];
		this.eventHandlers = {};
		// Monitoring properties
		this.monitoringOn = false;
		this.monitorIntervalMs = 1000; // Check every 1 second
		this.monitorStats = {
			// 'connectionId': {
			//	intervalId: null,
			//	prevReports: {}, // A dictionary to store the previous stats for calculation
			// }
		};
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
			if (this.monitoringOn) this.startBandwidthMonitor(conn);
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
				if (this.monitoringOn) this.startBandwidthMonitor(conn);
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

	async monitorBandwidth(conn) {
		// Get the underlying RTCPeerConnection
		const { peerConnection, connectionId } = conn;
		// console.log('Monitor', connectionId);
		if (peerConnection.connectionState !== 'connected') {
			// Stop monitoring if the connection is no longer active
			this.stopBandwithMonitor(conn);
			console.log('Connection closed.', peerConnection.connectionState, 'Stopping bandwidth monitor.');
			return;
		}
		try {
			const { prevReports } = this.monitorStats[connectionId];
			// Fetch the latest statistics
			const stats = await peerConnection.getStats(null);
			// console.log(stats);
			// Iterate over the reports to find the 'outbound-rtp' stats for the data channel
			stats.forEach((report) => {
				// 'outbound-rtp' report contains statistics for data being sent.
				// We're looking for totalBytesSent, which is a cumulative counter.
				if (report.type === 'data-channel') {
					const now = report.timestamp;
					const { bytesSent, bytesReceived } = report;
					const prevReport = prevReports[report.id];

					if (prevReport) {
						// Calculate the difference from the previous call
						const timeElapsedSec = (now - prevReport.timestamp) / 1000;
						const bytesSentDelta = bytesSent - prevReport.bytesSent;
						const bytesReceivedDelta = bytesReceived - prevReport.bytesReceived;

						// Calculate the rate (Bytes per second)
						const sentBytesPerSecond = bytesSentDelta / timeElapsedSec;
						const recBytesPerSecond = bytesReceivedDelta / timeElapsedSec;

						// console.log(`Bandwidth (Outbound): ${bytesPerSecond.toFixed(2)} bytes/sec`);
						// You can also calculate megabits per second (Mbps) for easier reading
						const outMbps = (sentBytesPerSecond * 8) / (1024 * 1024);
						const inMbps = (recBytesPerSecond * 8) / (1024 * 1024);
						console.log(
							`Bandwidth (${connectionId}) Outbound:`,
							outMbps.toFixed(2),
							'Mbps, Inbound:',
							inMbps.toFixed(2),
						);
					}
					// Store the current report for the next iteration's calculation
					prevReports[report.id] = report;
				}
			});
		} catch (error) {
			console.error('Error fetching stats:', error);
		}
	}

	startBandwidthMonitor(conn) {
		const { connectionId } = conn;
		this.monitorStats[connectionId] = {
			intervalId: null,
			prevReports: {},
		};
		console.log('Starting bandwidth monitor', connectionId, this.monitorStats);

		// Start a periodic check
		this.monitorStats[connectionId].intervalId = setInterval(() => {
			this.monitorBandwidth(conn);
		}, this.monitorIntervalMs);

		// Keep track of the interval ID so you can stop it later
		conn.on('close', () => this.stopBandwithMonitor(conn));
		conn.on('error', () => this.stopBandwithMonitor(conn));
	}

	stopBandwithMonitor(conn) {
		const { connectionId } = conn;
		clearInterval(this.monitorStats[connectionId].intervalId);
	}

	// Example usage after your PeerJS connection is established:
	// conn.on('open', function() {
	//    startBandwidthMonitor(conn);
	// });
}
