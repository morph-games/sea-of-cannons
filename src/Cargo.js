import { clamp } from './utils.js';
import entityTypes from './entityTypes.js';

export default class Cargo {
	static giveCargoToSlot(cargo, i, cargoType, amount = 0, cargoSlotSize = 0) {
		if (amount <= 0) return 0;
		let amountLeft = amount;
		if (!cargo[i]) {
			const givenToSlot = Math.min(cargoSlotSize, amountLeft);
			cargo[i] = [cargoType, givenToSlot];
			amountLeft -= givenToSlot;
		} else if (cargo[i][0] === cargoType) {
			const space = clamp(cargoSlotSize - cargo[i][1], 0, cargoSlotSize);
			const givenToSlot = Math.min(cargoSlotSize, amountLeft, space);
			cargo[i][1] += givenToSlot;
			amountLeft -= givenToSlot;
		}
		// Else: If the cargo type is not the same, then the cargo slot is occupied
		return amountLeft;
	}

	static giveCargo(boat, cargoType, amount = 0) {
		const entType = entityTypes[boat.entityTypeKey];
		const { cargoSlots = 0, cargoSlotSize = 1 } = entType;
		let amountLeft = amount;
		for (let i = 0; i < cargoSlots; i += 1) {
			amountLeft = Cargo.giveCargoToSlot(boat.cargo, i, cargoType, amountLeft, cargoSlotSize);
		}
		// console.log('Gave', amount - amountLeft, 'to boat.', amountLeft, 'lost.');
	}

	static removeCargo(boat, cargoType, amount = 1) {
		const entType = entityTypes[boat.entityTypeKey];
		const { cargoSlots = 0 } = entType;
		let amountLeftToRemove = amount;
		const { cargo } = boat;
		// Loop backwards to remove from right-most cargo slots first
		for (let i = cargoSlots - 1; i >= 0; i -= 1) {
			if (amountLeftToRemove > 0) {
				if (cargo[i] && cargo[i][0] === cargoType && cargo[i][1] > 0) {
					const removeAmount = Math.min(cargo[i][1], amount);
					boat.cargo[i][1] -= removeAmount;
					amountLeftToRemove -= removeAmount;
				}
			}
		}
		return amountLeftToRemove;
	}
}
