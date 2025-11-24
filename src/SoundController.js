import { zzfx } from 'zzfx'; // eslint-disable-line import/no-extraneous-dependencies
import { vec2 } from './Vector2.js';
import { pickRand } from './utils.js';

export default class SoundController {
	constructor() {
		this.maxDistance = 1000;
		this.baseVolume = 1;
		/* eslint-disable no-sparse-arrays, no-floating-decimal, comma-spacing */
		this.sounds = {
			// hit: [2.2,,228,,.01,.13,4,3.8,,,,,.05,.5,,.3,.13,.89,.08,.4],
			hit: [
				[2,,55,.06,.24,.54,4,,6,-8,,,,.7,,.5,,.45,.18],
			],
			fire: [
				[2,,44,.05,,.45,1,2.6,8,,,,,1.8,25,.9,,.32,.18,,1270],
				[2,,78,.04,.15,.27,4,1.1,8,3,,,,.7,,.5,.45,.32,.2],
			],
			splash: [
				[,,965,.33,.16,.47,4,1.3,,38,,,,,11,.1,,.89,.01,.22],
			],
			destroy: [
				[1.9,,84,.09,.22,.38,2,.4,-5,-6,,,,2,,.3,.11,.37,.17],
			],
			winning: [1.3,,548,.06,.21,.27,,1.9,,,151,.07,.03,,,.1,.19,.94,.27,.02],
			losing: [1.4,0,65.40639,.02,.39,.25,2,3,,,,,,.1,,,.05,.57,.02,,-1069],
		};
		/* eslint-enable no-sparse-arrays, no-floating-decimal, comma-spacing */
	}

	playSound(soundName, soundPos, hearingPos, intensity = 1) {
		if (!soundPos || !hearingPos) return;
		if (intensity < 0.9) return;
		const dist = vec2(soundPos).distance(vec2(hearingPos));
		if (dist > this.maxDistance) return;
		const volumePercent = 1 - (dist / this.maxDistance);
		console.log('Sound:', soundName, dist, volumePercent);
		const soundChoices = this.sounds[soundName];
		const soundArr = pickRand(soundChoices);
		soundArr[0] = volumePercent * this.baseVolume; // volume
		zzfx(...soundArr);
	}

	playSounds(soundArray, soundPos, hearingPos, intensity) {
		soundArray.forEach((sound) => this.playSound(sound, soundPos, hearingPos, intensity));
	}
}
