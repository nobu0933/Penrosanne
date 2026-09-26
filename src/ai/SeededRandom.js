// 山札とCPUの同点選択に別系列を渡し、思考内容が山札順を変えないようにする。
export function deriveSeed(seed, stream) {
	let value = Number(seed) >>> 0;
	for (const character of String(stream)) value = Math.imul(value ^ character.charCodeAt(0), 16777619) >>> 0;
	return value;
}

export function seededRandom(seed) {
	let state = Number(seed) >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}
