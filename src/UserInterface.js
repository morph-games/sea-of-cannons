import cargoTypes from './cargoTypes.js';

const $id = (id) => document.getElementById(id);

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

	static getInteger(n) {
		return Math.round(Number(n));
	}

	// setViewHeight() {
	// const vh = window.innerHeight * 0.01;
	// document.documentElement.style.setProperty('--vh', `${vh}px`);
	// }

	async init() {
		await UserInterface.waitForDOM();
		this.scoresElt = $id('scores');
		// this.connElt = $id('conn-details');
		this.currentConnection = $id('current-connection');
		this.healthElt = $id('health');
		this.throttleElt = $id('throttle');
		this.cargoElt = $id('cargo');
		this.deathDialog = $id('death');
		this.p2pDialog = $id('p2p-dialog');
		this.hostNameInput = $id('host-name');
		this.connectNameInput = $id('connect-name');
		this.playersElt = $id('players');
		this.titleElt = $id('title');
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
		if (target.closest('.tabs')) {
			const button = target.closest('button');
			if (button && button.dataset.tab) {
				const topUi = $id('top-ui');
				['ship', 'rep', 'p2p'].forEach((n) => {
					const className = `tabs-open-${n}`;
					console.log(topUi.classList);
					if (n === button.dataset.tab) topUi.classList.toggle(className);
					else topUi.classList.remove(className);
				});
				return true;
			}
		}
		return false;
	}

	renderPlayers(playerCount) {
		this.playersElt.innerText = `${playerCount} player${playerCount > 1 ? 's' : ''} online`;
	}

	renderScore(myScore, highScore) {
		if (!this.scoresElt) return;
		let emojis = '';
		if (highScore > 0) {
			emojis = (myScore >= highScore) ? '🏆😄' : '☹️';
		}
		this.scoresElt.innerHTML = `Your score: ${UserInterface.getInteger(myScore)}
			<br>${emojis}
			<br> High score: ${UserInterface.getInteger(highScore)}`;
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

	renderHealth(hp = 0) {
		if (!this.healthElt) return;
		const text = `HP: ${hp}`;
		if (this.healthElt.innerText !== text) this.healthElt.innerText = text;
	}

	renderCargo(cargo = []) {
		if (!this.cargoElt) return;
		const html = cargo.map((cargoSlot) => {
			const [cargoTypeKey = '', amount = 0] = cargoSlot || [];
			const isEmpty = amount === 0;
			let { name = '?' } = cargoTypes[cargoTypeKey] || {};
			if (isEmpty) name = 'Empty';
			return `<li class="cargo-slot ${isEmpty ? 'cargo-slot--empty' : ''}">
				<div class="cargo-slot-block">${isEmpty ? '' : UserInterface.getInteger(amount)}</div>
				<div class="cargo-slot-name">${name}</div>
			</li>`;
		}).join('');
		if (html !== this.cargoElt.innerHTML) this.cargoElt.innerHTML = html;
	}

	renderDeath(playerBoat) {
		if (!this.deathDialog) return;
		if (playerBoat && playerBoat.isDead) {
			if (!this.p2pDialog.open && !this.deathDialog.open) {
				this.deathDialog.showModal();
			}
		} else if (this.deathDialog.open) {
			this.deathDialog.close();
		}
	}

	removeTitle() {
		if (!this.titleElt) return;
		this.titleElt.classList.add('title--removed');
	}
}
