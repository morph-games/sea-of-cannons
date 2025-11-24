export default class UserInterface {
	constructor(player) {
		this.player = player;
		// Various element properties are created in init
		// Note: init is async so you can't assume this has been done as soon as the object
		// is instantiated
		this.init();
	}

	static waitForDOM() {
		if (document.readyState === 'loading') {
			return new Promise((resolve) => {
				window.addEventListener('DOMContentLoaded', resolve);
			});
		}
		return Promise.resolve();
	}

	// setViewHeight() {
	// const vh = window.innerHeight * 0.01;
	// document.documentElement.style.setProperty('--vh', `${vh}px`);
	// }

	async init() {
		await UserInterface.waitForDOM();
		const $id = (id) => document.getElementById(id);
		this.scoresElt = $id('scores');
		// this.connElt = $id('conn-details');
		this.currentConnection = $id('current-connection');
		this.throttleElt = $id('throttle');
		this.deathDialog = $id('death');
		this.p2pDialog = $id('p2p-dialog');
		this.hostNameInput = $id('host-name');
		this.connectNameInput = $id('connect-name');
		this.playersElt = $id('players');
		// this.setViewHeight();
		// window.addEventListener('resize', () => this.setViewHeight());
	}

	openP2PDialog() {
		this.deathDialog.close();
		this.p2pDialog.showModal();
	}

	async connectToPeerWorld() {
		// const peerId = window.prompt('Enter world name:', '1_wave_morph');
		// if (!peerId) return;
		let peerId = this.connectNameInput.value;
		if (!Number.isNaN(Number(peerId))) {
			peerId += '_wave_morph';
		}
		this.p2pDialog.close();
		await this.player.connectToWorld(peerId);
		this.renderConnection();
	}

	async hostWorld() {
		this.p2pDialog.close();
		await this.player.hostNewWorld();
		this.renderConnection();
	}

	handleButtonClicks(event) {
		const { target } = event;
		if (target.closest('.respawn')) {
			return 'RS';
		}
		if (target.closest('#conn-details')) {
			this.openP2PDialog();
			return true;
		}
		if (target.closest('.host-action')) {
			this.hostWorld();
			return true;
		}
		if (target.closest('.connect-action')) {
			this.connectToPeerWorld();
			return true;
		}
		if (target.closest('.close-p2p-dialog')) {
			this.p2pDialog.close();
			return true;
		}
		return false;
	}

	renderPlayers(playerCount, zoom) {
		this.playersElt.innerText = `${playerCount} player${playerCount > 1 ? 's' : ''} zoom: ${zoom}`;
	}

	renderScore(myScore, highScore) {
		if (!this.scoresElt) return;
		let emojis = '';
		if (highScore > 0) {
			emojis = (myScore >= highScore) ? '🏆😄' : '☹️';
		}
		this.scoresElt.innerHTML = `Your score: ${myScore}<br>${emojis}
			<br> High score: ${highScore}`;
	}

	renderConnection() {
		if (!this.currentConnection) return;
		const {
			text = '???',
			isHosting = true,
			worldPeerId = '???',
			// hostPeerId = '???',
		} = this.player.getConnectionDetails();
		const uiText = `${isHosting ? 'Hosting:' : 'Connected to:'} ${text}`;
		this.currentConnection.innerText = uiText;

		if (isHosting) {
			this.hostNameInput.value = worldPeerId;
		} else {
			this.connectNameInput.value = worldPeerId;
			this.hostNameInput.value = 'Will be generated';
		}
		this.p2pDialog.classList.toggle('p2p-connected', !isHosting);
		this.p2pDialog.classList.toggle('p2p-hosting', isHosting);
	}

	renderThrottle(throttleVal) {
		if (!this.throttleElt) return;
		let text = '';
		if (throttleVal > 0) text = '->';
		if (throttleVal < 0) text = '<-';
		this.throttleElt.innerText = text;
	}

	renderDeath(playerBoat) {
		if (!this.deathDialog) return;
		if (playerBoat && playerBoat.isDead && !this.p2pDialog.open) this.deathDialog.showModal();
		else this.deathDialog.close();
	}
}
