import { createTile, edgeNames } from './Tile.js';

const fields = (groups) =>
	groups.map((group, index) =>
		Array.isArray(group)
			? { id: `field-${index}`, boundaryEdges: group }
			: { id: `field-${index}`, ...group },
	);

// 草原得点用の小領域。番号は頂点の周囲を反時計回りに ①〜④ とする。
// `featureGroups.field` はミープル配置時の既存判定用であり、この定義は終局得点とホバー専用。
const SCORE_FIELD_GROUPS = {
	'straight-road': [
		[1, 4],
		[2, 3],
	],
	'straight-road-reverse': [
		[1, 2],
		[3, 4],
	],
	'curve-road-c': [[1, 3, 4], [2]],
	'curve-road-v': [[3], [4, 1, 2]],
	'city-one-side': [[1, 2, 3, 4]],
	'city-one-side-reverse': [[1, 2, 3, 4]],
	'city-one-side-straight-road': [
		[1, 2],
		[3, 4],
	],
	'city-one-side-straight-road-reverse': [
		[1, 4],
		[2, 3],
	],
	'city-one-side-curve-road-c': [[1, 3, 4], [2]],
	'city-one-side-curve-road-v': [[1, 2, 4], [3]],
	'city-one-side-curve-road-c-reverse': [[3, 1, 2], [4]],
	'city-one-side-curve-road-v-reverse': [[1, 2, 4], [3]],
	'city-road-end-c': [[1, 3, 4], [2]],
	'city-road-end-c-reverse': [[3, 1, 2], [4]],
	'city-road-end-v': [[1], [2, 3, 4]],
	'city-road-end-v-reverse': [[1], [2, 3, 4]],
	'city-one-two-road-ends': [
		[1, 4],
		[2],
		[3],
	],
	'city-one-two-road-ends-reverse': [
		[1, 2],
		[3],
		[4],
	],
	'city-road-end-third': [
		[1, 4],
		[2, 3],
	],
	'city-road-end-third-reverse': [
		[1, 2],
		[3, 4],
	],
	'city-opposite-separated-curve-road': [
		[1, 2, 4],
		[3],
	],
	'city-opposite-separated-road-second-to-first': [
		[1, 3, 4],
		[2],
	],
	'city-opposite-separated-road-second-to-first-reverse': [
		[1, 2, 3],
		[4],
	],
	'city-opposite-separated-road-third-to-first': [
		[1, 4],
		[2, 3],
	],
	'city-opposite-separated-road-third-to-first-reverse': [
		[1, 2],
		[3, 4],
	],
	'city-opposite-separated-two-road-ends': [
		[1, 3],
		[2],
		[4],
	],
	'city-opposite-connected-road-second-end': [
		[1, 3, 4],
		[2],
	],
	'city-opposite-connected-road-second-end-reverse': [
		[1, 2, 3],
		[4],
	],
	'city-opposite-connected-two-road-ends': [
		[1, 3],
		[2],
		[4],
	],
	'monastery-two-road-ends': [
		[1, 2, 4],
		[3],
	],
	't-junction': [[3], [4], [1, 2]],
	't-junction-reverse': [[1, 4], [2], [3]],
	'city-three-connected': [[3, 4, 1, 2]],
	'city-three-connected-reverse': [[3, 4, 1, 2]],
	'city-three-road': [[3], [4, 1, 2]],
	'city-three-road-reverse': [[3, 1, 2], [4]],
	'city-opposite-connected': [
		[2, 3],
		[1, 4],
	],
	'city-opposite-connected-reverse': [
		[1, 2],
		[3, 4],
	],
	'city-opposite-separated': [[1, 2, 3, 4]],
	'city-opposite-separated-reverse': [[1, 2, 3, 4]],
	'city-adjacent-connected-c': [[1, 2, 3, 4]],
	'city-adjacent-connected-v': [[1, 2, 3, 4]],
	'city-adjacent-curve-road-c': [[1, 2, 3], [4]],
	'city-adjacent-curve-road-v': [[1, 2, 4], [3]],
	'city-adjacent-separated-c': [[1, 2, 3, 4]],
	'city-adjacent-separated-v': [[1, 2, 3, 4]],
	'city-one-t-junction': [[3], [4], [1, 2]],
	'city-one-t-junction-reverse': [[1, 4], [2], [3]],
	'cross-junction': [[1], [2], [3], [4]],
	'monastery-field': [[1, 2, 3, 4]],
	'monastery-road-end': [[1, 2, 3, 4]],
	'monastery-road-end-reverse': [[3, 4, 1, 2]],
};

// アンカーの唯一の編集場所。キーは `${shape}:${idPrefix}`、配列順は featureGroups の添字と一致する。
// 数値は「タイル辺長を 1 とした、重心からの相対座標」。ここを直接変更して位置を調整する。
const A = (city = [], road = [], field = [], monastery = []) => ({
	city: city.map(([x, y]) => ({ x, y })),
	road: road.map(([x, y]) => ({ x, y })),
	field: field.map(([x, y]) => ({ x, y })),
	monastery: monastery.map(([x, y]) => ({ x, y })),
});
const MANUAL_FEATURE_ANCHORS = new Map([
	[
		'thin:straight-road',
		A(
			[],
			[[0, 0]],
			[
				[-0.28, -0.1],
				[0.28, 0.1],
			],
		),
	],
	[
		'fat:straight-road',
		A(
			[],
			[[0, 0]],
			[
				[-0.2, -0.25],
				[0.2, 0.25],
			],
		),
	],
	[
		'thin:straight-road-reverse',
		A(
			[],
			[[0, 0]],
			[
				[0.28, -0.1],
				[-0.28, 0.1],
			],
		),
	],
	[
		'fat:straight-road-reverse',
		A(
			[],
			[[0, 0]],
			[
				[0.2, -0.25],
				[-0.2, 0.25],
			],
		),
	],
	[
		'thin:curve-road-c',
		A(
			[],
			[[0.2, 0]],
			[
				[-0.3, 0],
				[0.6, 0],
			],
		),
	],
	[
		'fat:curve-road-c',
		A(
			[],
			[[0.1234, 0]],
			[
				[-0.3, 0],
				[0.4, 0],
			],
		),
	],
	[
		'thin:curve-road-v',
		A(
			[],
			[[0, 0.0649]],
			[
				[0, 0.25],
				[0, -0.2],
			],
		),
	],
	[
		'fat:curve-road-v',
		A(
			[],
			[[0, 0.1699]],
			[
				[0, 0.55],
				[0, -0.4],
			],
		),
	],
	['thin:city-one-side', A([[0.2996, -0.0973]], [], [[-0.6657, 0]])],
	['fat:city-one-side', A([[0.1852, -0.2548]], [], [[0, 0.5663]])],
	['thin:city-one-side-reverse', A([[-0.2996, -0.0973]], [], [[0.6657, 0]])],
	['fat:city-one-side-reverse', A([[-0.1852, -0.2548]], [], [[0, 0.5663]])],
	[
		'thin:city-one-side-straight-road',
		A(
			[[0.2996, -0.0973]],
			[[0, 0]],
			[
				[0, 0.28],
				[0, -0.22],
			],
		),
	],
	[
		'fat:city-one-side-straight-road',
		A(
			[[0.1852, -0.2548]],
			[[0, 0]],
			[
				[0, 0.28],
				[0, -0.22],
			],
		),
	],
	[
		'thin:city-one-side-straight-road-reverse',
		A(
			[[-0.2996, -0.0973]],
			[[0, 0]],
			[
				[-0.28, 0],
				[0, -0.22],
			],
		),
	],
	[
		'fat:city-one-side-straight-road-reverse',
		A(
			[[-0.1852, -0.2548]],
			[[0, 0]],
			[
				[-0.28, 0],
				[0, -0.22],
			],
		),
	],
	[
		'thin:city-one-side-curve-road-c',
		A(
			[[-0.2996, -0.0973]],
			[[0.1997, 0]],
			[
				[-0.26, -0.05],
				[0.2, -0.18],
			],
		),
	],
	[
		'fat:city-one-side-curve-road-c',
		A(
			[[-0.1852, -0.2548]],
			[[0.1234, 0]],
			[
				[-0.26, -0.05],
				[0.2, -0.18],
			],
		),
	],
	[
		'thin:city-one-side-curve-road-v',
		A(
			[[0.2996, -0.0973]],
			[[0, 0.0649]],
			[
				[-0.26, 0.05],
				[0.2, -0.18],
			],
		),
	],
	[
		'fat:city-one-side-curve-road-v',
		A(
			[[0.1852, -0.2548]],
			[[0, 0.1699]],
			[
				[-0.26, 0.05],
				[0.2, -0.18],
			],
		),
	],
	[
		'thin:city-one-side-curve-road-c-reverse',
		A(
			[[0.2996, -0.0973]],
			[[-0.1997, 0]],
			[
				[0.26, -0.05],
				[-0.2, 0.18],
			],
		),
	],
	[
		'fat:city-one-side-curve-road-c-reverse',
		A(
			[[0.1852, -0.2548]],
			[[-0.1234, 0]],
			[
				[0.26, -0.05],
				[-0.2, 0.18],
			],
		),
	],
	[
		'thin:city-one-side-curve-road-v-reverse',
		A(
			[[-0.2996, -0.0973]],
			[[0, 0.0649]],
			[
				[-0.26, 0.05],
				[0.2, -0.18],
			],
		),
	],
	[
		'fat:city-one-side-curve-road-v-reverse',
		A(
			[[-0.1852, -0.2548]],
			[[0, 0.1699]],
			[
				[-0.26, 0.05],
				[0.2, -0.18],
			],
		),
	],
	[
		'thin:city-road-end-c',
		A(
			[[0.2996, -0.0973]],
			[[0.1997, 0.0649]],
			[
				[0.08, 0.28],
				[-0.28, -0.08],
			],
		),
	],
	[
		'fat:city-road-end-c',
		A(
			[[0.1852, -0.2548]],
			[[0.1234, 0.1699]],
			[
				[0.08, 0.28],
				[-0.28, -0.08],
			],
		),
	],
	[
		'thin:city-road-end-c-reverse',
		A(
			[[-0.2996, -0.0973]],
			[[-0.1997, 0.0649]],
			[
				[0.28, -0.08],
				[-0.08, 0.28],
			],
		),
	],
	[
		'fat:city-road-end-c-reverse',
		A(
			[[-0.1852, -0.2548]],
			[[-0.1234, 0.1699]],
			[
				[0.28, -0.08],
				[-0.08, 0.28],
			],
		),
	],
	[
		'thin:city-road-end-v',
		A(
			[[0.2996, -0.0973]],
			[[-0.1997, -0.0649]],
			[
				[0.08, 0.28],
				[-0.28, -0.08],
			],
		),
	],
	[
		'fat:city-road-end-v',
		A(
			[[0.1852, -0.2548]],
			[[-0.1234, -0.1699]],
			[
				[0.08, 0.28],
				[-0.28, -0.08],
			],
		),
	],
	[
		'thin:city-road-end-v-reverse',
		A(
			[[-0.2996, -0.0973]],
			[[0.1997, -0.0649]],
			[
				[0.28, -0.08],
				[-0.08, 0.28],
			],
		),
	],
	[
		'fat:city-road-end-v-reverse',
		A(
			[[-0.1852, -0.2548]],
			[[0.1234, -0.1699]],
			[
				[0.28, -0.08],
				[-0.08, 0.28],
			],
		),
	],
	[
		'thin:t-junction',
		A(
			[],
			[
				[-0.1997, 0.0649],
				[-0.1997, -0.0649],
				[0.1997, 0.0649],
			],
			[
				[0, -0.3],
				[-0.2, 0.16],
				[0.2, 0.16],
			],
		),
	],
	[
		'fat:t-junction',
		A(
			[],
			[
				[-0.1234, 0.1699],
				[-0.1234, -0.1699],
				[0.1234, 0.1699],
			],
			[
				[0, -0.3],
				[-0.2, 0.16],
				[0.2, 0.16],
			],
		),
	],
	[
		'thin:t-junction-reverse',
		A(
			[],
			[
				[0.1997, -0.0649],
				[0.1997, 0.0649],
				[-0.1997, 0.0649],
			],
			[
				[0, 0.3],
				[0.2, -0.16],
				[-0.2, -0.16],
			],
		),
	],
	[
		'fat:t-junction-reverse',
		A(
			[],
			[
				[0.1234, -0.1699],
				[0.1234, 0.1699],
				[-0.1234, 0.1699],
			],
			[
				[0, 0.3],
				[0.2, -0.16],
				[-0.2, -0.16],
			],
		),
	],
	['thin:city-four-connected', A([[0, 0]])],
	['fat:city-four-connected', A([[0, 0]])],
	['thin:city-three-connected', A([[-0.0999, -0.0324]], [], [[0.6657, 0]])],
	['fat:city-three-connected', A([[-0.0617, -0.0849]], [], [[0, 0.5663]])],
	['thin:city-three-connected-reverse', A([[0.0999, -0.0324]], [], [[-0.6657, 0]])],
	['fat:city-three-connected-reverse', A([[0.0617, -0.0849]], [], [[0, 0.5663]])],
	[
		'thin:city-three-road',
		A(
			[[-0.0999, -0.0324]],
			[[0.1997, 0.0649]],
			[
				[0.2, 0.15],
				[-0.2, -0.15],
			],
		),
	],
	[
		'fat:city-three-road',
		A(
			[[-0.0617, -0.0849]],
			[[0.1234, 0.1699]],
			[
				[0.2, 0.15],
				[-0.2, -0.15],
			],
		),
	],
	[
		'thin:city-three-road-reverse',
		A(
			[[0.0999, -0.0324]],
			[[-0.1997, 0.0649]],
			[
				[-0.2, 0.15],
				[0.2, -0.15],
			],
		),
	],
	[
		'fat:city-three-road-reverse',
		A(
			[[0.0617, -0.0849]],
			[[-0.1234, 0.1699]],
			[
				[-0.2, 0.15],
				[0.2, -0.15],
			],
		),
	],
	[
		'thin:city-opposite-connected',
		A(
			[[0, 0]],
			[],
			[
				[0.28, 0],
				[-0.28, 0],
			],
		),
	],
	[
		'fat:city-opposite-connected',
		A(
			[[0, 0]],
			[],
			[
				[0.28, 0],
				[-0.28, 0],
			],
		),
	],
	[
		'thin:city-opposite-connected-reverse',
		A(
			[[0, 0]],
			[],
			[
				[-0.28, 0],
				[0.28, 0],
			],
		),
	],
	[
		'fat:city-opposite-connected-reverse',
		A(
			[[0, 0]],
			[],
			[
				[-0.28, 0],
				[0.28, 0],
			],
		),
	],
	[
		'thin:city-opposite-separated',
		A(
			[
				[0.2996, -0.0973],
				[-0.2996, 0.0973],
			],
			[],
			[[0.6657, 0]],
		),
	],
	[
		'fat:city-opposite-separated',
		A(
			[
				[0.1852, -0.2548],
				[-0.1852, 0.2548],
			],
			[],
			[[0.3821, 0.0809]],
		),
	],
	[
		'thin:city-opposite-separated-reverse',
		A(
			[
				[0.2996, 0.0973],
				[-0.2996, -0.0973],
			],
			[],
			[[0.6657, 0]],
		),
	],
	[
		'fat:city-opposite-separated-reverse',
		A(
			[
				[0.1852, 0.2548],
				[-0.1852, -0.2548],
			],
			[],
			[[0.3821, -0.0809]],
		),
	],
	['thin:city-adjacent-connected-c', A([[0.2996, 0]], [], [[-0.6657, 0]])],
	['fat:city-adjacent-connected-c', A([[0.1852, 0]], [], [[-0.4114, 0]])],
	['thin:city-adjacent-connected-v', A([[0, -0.0973]], [], [[0.6657, 0]])],
	['fat:city-adjacent-connected-v', A([[0, -0.2548]], [], [[0, 0.5663]])],
	[
		'thin:city-adjacent-curve-road-c',
		A(
			[[0.2996, 0]],
			[[-0.1997, 0]],
			[
				[-0.2, 0.16],
				[0.2, -0.16],
			],
		),
	],
	[
		'fat:city-adjacent-curve-road-c',
		A(
			[[0.1852, 0]],
			[[-0.1234, 0]],
			[
				[-0.2, 0.16],
				[0.2, -0.16],
			],
		),
	],
	[
		'thin:city-adjacent-curve-road-v',
		A(
			[[0, -0.0973]],
			[[0, 0.0649]],
			[
				[0.2, 0.16],
				[-0.2, -0.16],
			],
		),
	],
	[
		'fat:city-adjacent-curve-road-v',
		A(
			[[0, -0.2548]],
			[[0, 0.1699]],
			[
				[0.2, 0.16],
				[-0.2, -0.16],
			],
		),
	],
	[
		'thin:city-adjacent-separated-c',
		A(
			[
				[0.2996, -0.0973],
				[0.2996, 0.0973],
			],
			[],
			[[-0.6657, 0]],
		),
	],
	[
		'fat:city-adjacent-separated-c',
		A(
			[
				[0.1852, -0.2548],
				[0.1852, 0.2548],
			],
			[],
			[[-0.4114, 0]],
		),
	],
	[
		'thin:city-adjacent-separated-v',
		A(
			[
				[0.2996, -0.0973],
				[-0.2996, -0.0973],
			],
			[],
			[[0, 0.2163]],
		),
	],
	[
		'fat:city-adjacent-separated-v',
		A(
			[
				[0.1852, -0.2548],
				[-0.1852, -0.2548],
			],
			[],
			[[0, 0.5663]],
		),
	],
	[
		'thin:city-one-t-junction',
		A(
			[[0.2996, -0.0973]],
			[
				[0.1997, 0.0649],
				[-0.1997, 0.0649],
				[-0.1997, -0.0649],
			],
			[
				[0.22, -0.12],
				[0.1, 0.24],
				[-0.22, 0.08],
			],
		),
	],
	[
		'fat:city-one-t-junction',
		A(
			[[0.1852, -0.2548]],
			[
				[0.1234, 0.1699],
				[-0.1234, 0.1699],
				[-0.1234, -0.1699],
			],
			[
				[0.22, -0.12],
				[0.1, 0.24],
				[-0.22, 0.08],
			],
		),
	],
	[
		'thin:city-one-t-junction-reverse',
		A(
			[[-0.2996, -0.0973]],
			[
				[0.1997, 0.0649],
				[-0.1997, 0.0649],
				[0.1997, -0.0649],
			],
			[
				[-0.22, -0.12],
				[-0.1, 0.24],
				[0.22, 0.08],
			],
		),
	],
	[
		'fat:city-one-t-junction-reverse',
		A(
			[[-0.1852, -0.2548]],
			[
				[0.1234, 0.1699],
				[-0.1234, 0.1699],
				[0.1234, -0.1699],
			],
			[
				[-0.22, -0.12],
				[-0.1, 0.24],
				[0.22, 0.08],
			],
		),
	],
	[
		'thin:cross-junction',
		A(
			[],
			[
				[0.1997, -0.0649],
				[0.1997, 0.0649],
				[-0.1997, 0.0649],
				[-0.1997, -0.0649],
			],
			[
				[0.2, -0.2],
				[0.2, 0.2],
				[-0.2, 0.2],
				[-0.2, -0.2],
			],
		),
	],
	[
		'fat:cross-junction',
		A(
			[],
			[
				[0.1234, -0.1699],
				[0.1234, 0.1699],
				[-0.1234, 0.1699],
				[-0.1234, -0.1699],
			],
			[
				[0.2, -0.2],
				[0.2, 0.2],
				[-0.2, 0.2],
				[-0.2, -0.2],
			],
		),
	],
	['thin:monastery-field', A([], [], [[0, -0.2163]], [[0, 0]])],
	['fat:monastery-field', A([], [], [[0, -0.5663]], [[0, 0]])],
	['thin:monastery-road-end', A([], [[0.1997, 0.0649]], [[-0.12, 0.16]], [[0, 0]])],
	['fat:monastery-road-end', A([], [[0.1234, 0.1699]], [[-0.12, 0.16]], [[0, 0]])],
	['thin:monastery-road-end-reverse', A([], [[-0.1997, 0.0649]], [[-0.12, -0.16]], [[0, 0]])],
	['fat:monastery-road-end-reverse', A([], [[-0.1234, 0.1699]], [[-0.12, -0.16]], [[0, 0]])],
	[
		'thin:city-one-two-road-ends',
		A(
			[[0.2996, -0.0973]],
			[
				[0.1997, 0.0649],
				[-0.1997, 0.0649],
			],
			[
				[-0.14, -0.18],
				[0.26, 0.15],
				[-0.26, 0.15],
			],
		),
	],
	[
		'fat:city-one-two-road-ends',
		A(
			[[0.1852, -0.2548]],
			[
				[0.1234, 0.1699],
				[-0.1234, 0.1699],
			],
			[
				[-0.12, -0.36],
				[0.22, 0.3],
				[-0.22, 0.3],
			],
		),
	],
	[
		'thin:city-one-two-road-ends-reverse',
		A(
			[[-0.2996, -0.0973]],
			[
				[0.1997, 0.0649],
				[-0.1997, 0.0649],
			],
			[
				[0.14, 0.18],
				[0.26, -0.15],
				[-0.26, -0.15],
			],
		),
	],
	[
		'fat:city-one-two-road-ends-reverse',
		A(
			[[-0.1852, -0.2548]],
			[
				[0.1234, 0.1699],
				[-0.1234, 0.1699],
			],
			[
				[0.12, 0.36],
				[0.22, -0.3],
				[-0.22, -0.3],
			],
		),
	],
	[
		'thin:city-road-end-third',
		A(
			[[0.2996, -0.0973]],
			[[-0.1997, 0.0649]],
			[
				[0.22, 0.1],
				[-0.22, 0.1],
			],
		),
	],
	[
		'fat:city-road-end-third',
		A(
			[[0.1852, -0.2548]],
			[[-0.1234, 0.1699]],
			[
				[0.18, 0.28],
				[-0.18, 0.28],
			],
		),
	],
	[
		'thin:city-road-end-third-reverse',
		A(
			[[-0.2996, -0.0973]],
			[[0.1997, 0.0649]],
			[
				[0.22, -0.1],
				[-0.22, -0.1],
			],
		),
	],
	[
		'fat:city-road-end-third-reverse',
		A(
			[[-0.1852, -0.2548]],
			[[0.1234, 0.1699]],
			[
				[0.18, -0.28],
				[-0.18, -0.28],
			],
		),
	],
	[
		'thin:city-opposite-separated-curve-road',
		A(
			[
				[0.2996, -0.0973],
				[-0.2996, -0.0973],
			],
			[[0, 0.0649]],
			[
				[0.12, 0.18],
				[-0.12, -0.18],
			],
		),
	],
	[
		'fat:city-opposite-separated-curve-road',
		A(
			[
				[0.1852, -0.2548],
				[-0.1852, -0.2548],
			],
			[[0, 0.1699]],
			[
				[0.1, 0.34],
				[-0.1, -0.34],
			],
		),
	],
	[
		'thin:city-opposite-separated-road-second-to-first',
		A(
			[
				[0.2996, -0.0973],
				[-0.2996, -0.0973],
			],
			[[0.1997, 0.0649]],
			[
				[-0.2, 0.16],
				[0, -0.1],
			],
		),
	],
	[
		'fat:city-opposite-separated-road-second-to-first',
		A(
			[
				[0.1852, -0.2548],
				[-0.1852, -0.2548],
			],
			[[0.1234, 0.1699]],
			[
				[-0.16, 0.34],
				[0, -0.18],
			],
		),
	],
	[
		'thin:city-opposite-separated-road-second-to-first-reverse',
		A(
			[
				[0.2996, -0.0973],
				[-0.2996, -0.0973],
			],
			[[-0.1997, 0.0649]],
			[
				[0.2, -0.16],
				[0, 0.1],
			],
		),
	],
	[
		'fat:city-opposite-separated-road-second-to-first-reverse',
		A(
			[
				[0.1852, -0.2548],
				[-0.1852, -0.2548],
			],
			[[-0.1234, 0.1699]],
			[
				[0.16, -0.34],
				[0, 0.18],
			],
		),
	],
	[
		'thin:city-opposite-separated-road-third-to-first',
		A(
			[
				[0.2996, -0.0973],
				[-0.2996, -0.0973],
			],
			[[-0.1997, 0.0649]],
			[
				[0.2, 0.16],
				[0, -0.1],
			],
		),
	],
	[
		'fat:city-opposite-separated-road-third-to-first',
		A(
			[
				[0.1852, -0.2548],
				[-0.1852, -0.2548],
			],
			[[-0.1234, 0.1699]],
			[
				[0.16, 0.34],
				[0, -0.18],
			],
		),
	],
	[
		'thin:city-opposite-separated-road-third-to-first-reverse',
		A(
			[
				[0.2996, -0.0973],
				[-0.2996, -0.0973],
			],
			[[0.1997, 0.0649]],
			[
				[-0.2, -0.16],
				[0, 0.1],
			],
		),
	],
	[
		'fat:city-opposite-separated-road-third-to-first-reverse',
		A(
			[
				[0.1852, -0.2548],
				[-0.1852, -0.2548],
			],
			[[0.1234, 0.1699]],
			[
				[-0.16, -0.34],
				[0, 0.18],
			],
		),
	],
	[
		'thin:city-opposite-separated-two-road-ends',
		A(
			[
				[0.2996, -0.0973],
				[-0.2996, -0.0973],
			],
			[
				[0.1997, 0.0649],
				[-0.1997, 0.0649],
			],
			[
				[0.1, 0.18],
				[0.28, -0.02],
				[-0.28, -0.02],
			],
		),
	],
	[
		'fat:city-opposite-separated-two-road-ends',
		A(
			[
				[0.1852, -0.2548],
				[-0.1852, -0.2548],
			],
			[
				[0.1234, 0.1699],
				[-0.1234, 0.1699],
			],
			[
				[0.08, 0.34],
				[0.22, -0.04],
				[-0.22, -0.04],
			],
		),
	],
	[
		'thin:city-opposite-connected-road-second-end',
		A(
			[[0, -0.18]],
			[[0.1997, 0.0649]],
			[
				[-0.2, 0.16],
				[0, -0.1],
			],
		),
	],
	[
		'fat:city-opposite-connected-road-second-end',
		A(
			[[0, -0.42]],
			[[0.1234, 0.1699]],
			[
				[-0.16, 0.34],
				[0, -0.18],
			],
		),
	],
	[
		'thin:city-opposite-connected-road-second-end-reverse',
		A(
			[[0, 0.18]],
			[[-0.1997, 0.0649]],
			[
				[0.2, -0.16],
				[0, 0.1],
			],
		),
	],
	[
		'fat:city-opposite-connected-road-second-end-reverse',
		A(
			[[0, 0.42]],
			[[-0.1234, 0.1699]],
			[
				[0.16, -0.34],
				[0, 0.18],
			],
		),
	],
	[
		'thin:city-opposite-connected-two-road-ends',
		A(
			[[0, 0]],
			[
				[0.1997, 0.0649],
				[-0.1997, 0.0649],
			],
			[
				[0.1, 0.18],
				[0.28, -0.02],
				[-0.28, -0.02],
			],
		),
	],
	[
		'fat:city-opposite-connected-two-road-ends',
		A(
			[[0, 0]],
			[
				[0.1234, 0.1699],
				[-0.1234, 0.1699],
			],
			[
				[0.08, 0.34],
				[0.22, -0.04],
				[-0.22, -0.04],
			],
		),
	],
	[
		'thin:monastery-two-road-ends',
		A(
			[],
			[
				[0.1997, 0.0649],
				[-0.1997, 0.0649],
			],
			[
				[-0.18, -0.12],
				[0, 0.26],
			],
			[[0, 0]],
		),
	],
	[
		'fat:monastery-two-road-ends',
		A(
			[],
			[
				[0.1234, 0.1699],
				[-0.1234, 0.1699],
			],
			[
				[-0.14, -0.24],
				[0, 0.36],
			],
			[[0, 0]],
		),
	],
]);
function explicitAnchorsFor(shape, kind) {
	const anchors = MANUAL_FEATURE_ANCHORS.get(`${shape}:${kind}`);
	if (!anchors) throw new Error(`Missing manual anchors: ${shape}:${kind}`);
	return structuredClone(anchors);
}

function scoreFieldGroupsFor(kind, definition) {
	if (!definition.featureGroups.field.length) return [];
	const groups = SCORE_FIELD_GROUPS[kind];
	if (!groups) throw new Error(`Missing score-field definition: ${kind}`);
	if (groups.length !== definition.featureGroups.field.length)
		throw new Error(`Score-field group count mismatch: ${kind}`);
	return groups.map((group) => [...group]);
}

function scoreFieldCityAdjacency(shape, definition, groups) {
	const edges = edgeNames(shape);
	// 小領域は両隣の辺に接する。都市グループごとに、その都市辺へ実際に接する
	// 小領域だけを得点対象の草原として登録する。
	return Object.fromEntries(
		groups.map((subregions, fieldIndex) => [
			fieldIndex,
			(definition.featureGroups.city || [])
				.map((cityEdges, cityIndex) => ({ cityEdges, cityIndex }))
				.filter(({ cityEdges }) =>
					subregions.some((subregion) => {
						const vertexIndex = subregion - 1;
						return (
							cityEdges.includes(edges[vertexIndex]) ||
							cityEdges.includes(edges[(vertexIndex + 3) % 4])
						);
					}),
				)
				.map(({ cityIndex }) => cityIndex),
		]),
	);
}

// 各データは画面方向ではなく、頂点の組で辺を表す。
const dataFor = (shape, kind) => {
	const [first, second, third, fourth] = edgeNames(shape);
	const allField = () => fields([[first, second, third, fourth]]);
	switch (kind) {
		case 'straight-road':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'F', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[first, third]],
					field: fields([
						{ boundaryEdges: [second], anchor: { x: 0.28, y: 0 } },
						{ boundaryEdges: [fourth], anchor: { x: -0.28, y: 0 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: first },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [], 1: [] },
			};
		case 'straight-road-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'F', [fourth]: 'R' },
				featureGroups: {
					city: [],
					road: [[second, fourth]],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: -0.28, y: 0 } },
						{ boundaryEdges: [third], anchor: { x: 0.28, y: 0 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'edge', edge: fourth },
					],
				},
				fieldCityAdjacency: { 0: [], 1: [] },
			};
		case 'curve-road-c':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'R', [third]: 'F', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[first, second]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: 0.08, y: 0.28 } },
						{ boundaryEdges: [fourth], anchor: { x: -0.28, y: -0.08 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: first },
						{ kind: 'edge', edge: second },
					],
				},
				fieldCityAdjacency: { 0: [], 1: [] },
			};
		case 'curve-road-v':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[third, second]],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: -0.08, y: -0.28 } },
						{ boundaryEdges: [fourth], anchor: { x: -0.28, y: -0.08 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'edge', edge: second },
					],
				},
				fieldCityAdjacency: { 0: [], 1: [] },
			};
		case 'city-one-side':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'F', [fourth]: 'F' },
				featureGroups: { city: [[first]], road: [], field: fields([[second, third, fourth]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-one-side-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'F', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[fourth]], road: [], field: fields([[second, third, first]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-one-side-straight-road':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'F', [fourth]: 'R' },
				featureGroups: {
					city: [[first]],
					road: [[fourth, second]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: 0, y: 0.28 } },
						{ boundaryEdges: [], anchor: { x: 0, y: -0.22 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: fourth },
						{ kind: 'edge', edge: second },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-side-straight-road-reverse':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'F', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[first, third]],
					field: fields([
						{ boundaryEdges: [second], anchor: { x: -0.28, y: 0 } },
						{ boundaryEdges: [], anchor: { x: 0, y: -0.22 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: first },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-side-curve-road-c':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'R', [third]: 'F', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[second, first]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: -0.26, y: -0.05 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.18 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'edge', edge: first },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-side-curve-road-v':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [[first]],
					road: [[second, third]],
					field: fields([
						{ boundaryEdges: [fourth], anchor: { x: -0.26, y: 0.05 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.18 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-side-curve-road-c-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'R', [fourth]: 'R' },
				featureGroups: {
					city: [[first]],
					road: [[fourth, third]],
					field: fields([
						{ boundaryEdges: [second], anchor: { x: 0.26, y: -0.05 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: 0.18 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: fourth },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-side-curve-road-v-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[second, third]],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: -0.26, y: 0.05 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.18 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-road-end-c':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'F', [fourth]: 'F' },
				featureGroups: {
					city: [[first]],
					road: [[second]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: 0.08, y: 0.28 } },
						{ boundaryEdges: [fourth], anchor: { x: -0.28, y: -0.08 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-road-end-c-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'F', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[third]],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: 0.28, y: -0.08 } },
						{ boundaryEdges: [second], anchor: { x: -0.08, y: 0.28 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-road-end-v':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'F', [fourth]: 'R' },
				featureGroups: {
					city: [[first]],
					road: [[fourth]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: 0.08, y: 0.28 } },
						{ boundaryEdges: [second], anchor: { x: -0.28, y: -0.08 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: fourth },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-road-end-v-reverse':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'F', [third]: 'F', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[first]],
					field: fields([
						{ boundaryEdges: [third], anchor: { x: 0.28, y: -0.08 } },
						{ boundaryEdges: [second], anchor: { x: -0.08, y: 0.28 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: first },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-one-two-road-ends':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [[first]],
					road: [[second], [third]],
					field: fields([[fourth], [], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
					1: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0], 2: [0] },
			};
		case 'city-one-two-road-ends-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[second], [third]],
					field: fields([[first], [], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
					1: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0], 2: [0] },
			};
		case 'city-road-end-third':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'R', [fourth]: 'F' },
				featureGroups: { city: [[first]], road: [[third]], field: fields([[second], [fourth]]) },
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-road-end-third-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[fourth]], road: [[second]], field: fields([[first], [third]]) },
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-separated-curve-road':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[second, third]],
					field: fields([[], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'edge', edge: third },
					],
				},
				fieldCityAdjacency: { 0: [0, 1], 1: [0, 1] },
			};
		case 'city-opposite-separated-road-second-to-first':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'F', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[second]],
					field: fields([[third], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0, 1], 1: [0] },
			};
		case 'city-opposite-separated-road-second-to-first-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[third]],
					field: fields([[second], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 1 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [1] },
			};
		case 'city-opposite-separated-road-third-to-first':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[third]],
					field: fields([[second], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [1] },
			};
		case 'city-opposite-separated-road-third-to-first-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'F', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[second]],
					field: fields([[third], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 1 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [1] },
			};
		case 'city-opposite-separated-two-road-ends':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first], [fourth]],
					road: [[second], [third]],
					field: fields([[], [], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
					1: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 1 },
					],
				},
				fieldCityAdjacency: { 0: [0, 1], 1: [0], 2: [1] },
			};
		case 'city-opposite-connected-road-second-end':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[first, fourth]], road: [[second]], field: fields([[third], []]) },
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-connected-road-second-end-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'R', [fourth]: 'C' },
				featureGroups: { city: [[first, fourth]], road: [[third]], field: fields([[second], []]) },
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-connected-two-road-ends':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first, fourth]],
					road: [[second], [third]],
					field: fields([[], [], []]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
					1: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0], 2: [0] },
			};
		case 'monastery-two-road-ends':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'R', [fourth]: 'F' },
				featureGroups: { city: [], road: [[second], [third]], field: fields([[first], [fourth]]) },
				roadTerminals: {
					0: [{ kind: 'edge', edge: second }, { kind: 'monastery' }],
					1: [{ kind: 'edge', edge: third }, { kind: 'monastery' }],
				},
				fieldCityAdjacency: { 0: [], 1: [] },
				hasMonastery: true,
			};
		case 't-junction':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'R', [fourth]: 'R' },
				featureGroups: {
					city: [],
					road: [[third], [fourth], [second]],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: 0, y: -0.3 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: 0.16 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: 0.16 } },
					]),
				},
				roadTerminals: Object.fromEntries(
					[third, fourth, second].map((edge, index) => [
						index,
						[
							{ kind: 'edge', edge },
							{ kind: 'intersection', intersectionId: 'junction-0' },
						],
					]),
				),
				fieldCityAdjacency: { 0: [], 1: [], 2: [] },
			};
		case 't-junction-reverse':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'R', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[first], [second], [third]],
					field: fields([
						{ boundaryEdges: [fourth], anchor: { x: 0, y: 0.3 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.16 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: -0.16 } },
					]),
				},
				roadTerminals: Object.fromEntries(
					[first, second, third].map((edge, index) => [
						index,
						[
							{ kind: 'edge', edge },
							{ kind: 'intersection', intersectionId: 'junction-0' },
						],
					]),
				),
				fieldCityAdjacency: { 0: [], 1: [], 2: [] },
			};
		case 'city-four-connected':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'C', [fourth]: 'C' },
				featureGroups: { city: [[first, second, third, fourth]], road: [], field: [] },
				roadTerminals: {},
				fieldCityAdjacency: {},
			};
		case 'city-three-connected':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'C', [fourth]: 'C' },
				featureGroups: { city: [[third, fourth, first]], road: [], field: fields([[second]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-three-connected-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[second, fourth, first]], road: [], field: fields([[third]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-three-road':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'C', [fourth]: 'C' },
				featureGroups: {
					city: [[third, fourth, first]],
					road: [[second]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: 0.2, y: 0.15 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: -0.15 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: second },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-three-road-reverse':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[second, fourth, first]],
					road: [[third]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: -0.2, y: 0.15 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.15 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'city', cityGroup: 0 },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-connected':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'C', [fourth]: 'F' },
				featureGroups: {
					city: [[first, third]],
					road: [],
					field: fields([
						{ boundaryEdges: [second], anchor: { x: 0.28, y: 0 } },
						{ boundaryEdges: [fourth], anchor: { x: -0.28, y: 0 } },
					]),
				},
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-connected-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'C', [third]: 'F', [fourth]: 'C' },
				featureGroups: {
					city: [[second, fourth]],
					road: [],
					field: fields([
						{ boundaryEdges: [first], anchor: { x: -0.28, y: 0 } },
						{ boundaryEdges: [third], anchor: { x: 0.28, y: 0 } },
					]),
				},
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-opposite-separated':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'C', [fourth]: 'F' },
				featureGroups: { city: [[first], [third]], road: [], field: fields([[second, fourth]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0, 1] },
			};
		case 'city-opposite-separated-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'C', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[second], [fourth]], road: [], field: fields([[first, third]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0, 1] },
			};
		case 'city-adjacent-connected-c':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'F', [fourth]: 'F' },
				featureGroups: { city: [[first, second]], road: [], field: fields([[third, fourth]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-adjacent-connected-v':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[first, fourth]], road: [], field: fields([[third, second]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0] },
			};
		case 'city-adjacent-curve-road-c':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'R', [fourth]: 'R' },
				featureGroups: {
					city: [[first, second]],
					road: [[third, fourth]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: -0.2, y: 0.16 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.16 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'edge', edge: fourth },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-adjacent-curve-road-v':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[first, fourth]],
					road: [[third, second]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: 0.2, y: 0.16 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: -0.16 } },
					]),
				},
				roadTerminals: {
					0: [
						{ kind: 'edge', edge: third },
						{ kind: 'edge', edge: second },
					],
				},
				fieldCityAdjacency: { 0: [0], 1: [0] },
			};
		case 'city-adjacent-separated-c':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'C', [third]: 'F', [fourth]: 'F' },
				featureGroups: { city: [[first], [second]], road: [], field: fields([[third, fourth]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0, 1] },
			};
		case 'city-adjacent-separated-v':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'F', [third]: 'F', [fourth]: 'C' },
				featureGroups: { city: [[first], [fourth]], road: [], field: fields([[third, second]]) },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [0, 1] },
			};
		case 'city-one-t-junction':
			return {
				edgeTerrain: { [first]: 'C', [second]: 'R', [third]: 'R', [fourth]: 'R' },
				featureGroups: {
					city: [[first]],
					road: [[second], [third], [fourth]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: 0.22, y: -0.12 } },
						{ boundaryEdges: [], anchor: { x: 0.1, y: 0.24 } },
						{ boundaryEdges: [], anchor: { x: -0.22, y: 0.08 } },
					]),
				},
				roadTerminals: Object.fromEntries(
					[second, third, fourth].map((edge, index) => [
						index,
						[
							{ kind: 'edge', edge },
							{ kind: 'intersection', intersectionId: 'junction-0' },
						],
					]),
				),
				fieldCityAdjacency: { 0: [0], 1: [0], 2: [0] },
			};
		case 'city-one-t-junction-reverse':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'R', [third]: 'R', [fourth]: 'C' },
				featureGroups: {
					city: [[fourth]],
					road: [[second], [third], [first]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: -0.22, y: -0.12 } },
						{ boundaryEdges: [], anchor: { x: -0.1, y: 0.24 } },
						{ boundaryEdges: [], anchor: { x: 0.22, y: 0.08 } },
					]),
				},
				roadTerminals: Object.fromEntries(
					[second, third, first].map((edge, index) => [
						index,
						[
							{ kind: 'edge', edge },
							{ kind: 'intersection', intersectionId: 'junction-0' },
						],
					]),
				),
				fieldCityAdjacency: { 0: [0], 1: [0], 2: [0] },
			};
		case 'cross-junction':
			return {
				edgeTerrain: { [first]: 'R', [second]: 'R', [third]: 'R', [fourth]: 'R' },
				featureGroups: {
					city: [],
					road: [[first], [second], [third], [fourth]],
					field: fields([
						{ boundaryEdges: [], anchor: { x: 0.2, y: -0.2 } },
						{ boundaryEdges: [], anchor: { x: 0.2, y: 0.2 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: 0.2 } },
						{ boundaryEdges: [], anchor: { x: -0.2, y: -0.2 } },
					]),
				},
				roadTerminals: Object.fromEntries(
					[first, second, third, fourth].map((edge, index) => [
						index,
						[
							{ kind: 'edge', edge },
							{ kind: 'intersection', intersectionId: 'cross-0' },
						],
					]),
				),
				fieldCityAdjacency: { 0: [], 1: [], 2: [], 3: [] },
			};
		case 'monastery-field':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'F', [third]: 'F', [fourth]: 'F' },
				featureGroups: { city: [], road: [], field: allField() },
				roadTerminals: {},
				fieldCityAdjacency: { 0: [] },
				hasMonastery: true,
			};
		case 'monastery-road-end':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'R', [third]: 'F', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[second]],
					field: fields([{ boundaryEdges: [first, third, fourth], anchor: { x: -0.12, y: 0.16 } }]),
				},
				roadTerminals: {
					0: [{ kind: 'edge', edge: second }, { kind: 'monastery' }],
				},
				fieldCityAdjacency: { 0: [] },
				hasMonastery: true,
			};
		case 'monastery-road-end-reverse':
			return {
				edgeTerrain: { [first]: 'F', [second]: 'F', [third]: 'R', [fourth]: 'F' },
				featureGroups: {
					city: [],
					road: [[third]],
					field: fields([
						{ boundaryEdges: [fourth, first, second], anchor: { x: -0.12, y: -0.16 } },
					]),
				},
				roadTerminals: {
					0: [{ kind: 'edge', edge: third }, { kind: 'monastery' }],
				},
				fieldCityAdjacency: { 0: [] },
				hasMonastery: true,
			};
		default:
			throw new Error(`Unknown tile kind: ${kind}`);
	}
};

// 暫定タイルセット。各定義をシン・ファットへ割り当てる。
const CATALOG_DEFINITIONS = [
	['straight-road', 2, 'thin'],
	['straight-road', 2, 'fat'],
	['straight-road-reverse', 2, 'thin'],
	['straight-road-reverse', 2, 'fat'],
	['curve-road-c', 2, 'thin'],
	['curve-road-c', 2, 'fat'],
	['curve-road-v', 2, 'thin'],
	['curve-road-v', 2, 'fat'],
	['city-one-side', 2, 'thin'],
	['city-one-side', 2, 'fat'],
	['city-one-side-reverse', 2, 'thin'],
	['city-one-side-reverse', 2, 'fat'],
	['city-one-side-straight-road', 1, 'thin'],
	['city-one-side-straight-road', 1, 'fat'],
	['city-one-side-straight-road-reverse', 1, 'thin'],
	['city-one-side-straight-road-reverse', 1, 'fat'],
	['city-one-side-curve-road-c', 1, 'thin'],
	['city-one-side-curve-road-c', 1, 'fat'],
	['city-one-side-curve-road-v', 1, 'thin'],
	['city-one-side-curve-road-v', 1, 'fat'],
	['city-one-side-curve-road-c-reverse', 1, 'thin'],
	['city-one-side-curve-road-c-reverse', 1, 'fat'],
	['city-one-side-curve-road-v-reverse', 1, 'thin'],
	['city-one-side-curve-road-v-reverse', 1, 'fat'],
	['city-road-end-c', 1, 'thin'],
	['city-road-end-c', 1, 'fat'],
	['city-road-end-c-reverse', 1, 'thin'],
	['city-road-end-c-reverse', 1, 'fat'],
	['city-road-end-v', 1, 'thin'],
	['city-road-end-v', 1, 'fat'],
	['city-road-end-v-reverse', 1, 'thin'],
	['city-road-end-v-reverse', 1, 'fat'],
	['city-one-two-road-ends', 1, 'thin'],
	['city-one-two-road-ends', 1, 'fat'],
	['city-one-two-road-ends-reverse', 1, 'thin'],
	['city-one-two-road-ends-reverse', 1, 'fat'],
	['city-road-end-third', 1, 'thin'],
	['city-road-end-third', 1, 'fat'],
	['city-road-end-third-reverse', 1, 'thin'],
	['city-road-end-third-reverse', 1, 'fat'],
	['city-opposite-separated-curve-road', 1, 'thin'],
	['city-opposite-separated-curve-road', 1, 'fat'],
	['city-opposite-separated-road-second-to-first', 1, 'thin'],
	['city-opposite-separated-road-second-to-first', 1, 'fat'],
	['city-opposite-separated-road-second-to-first-reverse', 1, 'thin'],
	['city-opposite-separated-road-second-to-first-reverse', 1, 'fat'],
	['city-opposite-separated-road-third-to-first', 1, 'thin'],
	['city-opposite-separated-road-third-to-first', 1, 'fat'],
	['city-opposite-separated-road-third-to-first-reverse', 1, 'thin'],
	['city-opposite-separated-road-third-to-first-reverse', 1, 'fat'],
	['city-opposite-separated-two-road-ends', 1, 'thin'],
	['city-opposite-separated-two-road-ends', 1, 'fat'],
	['city-opposite-connected-road-second-end', 1, 'thin'],
	['city-opposite-connected-road-second-end', 1, 'fat'],
	['city-opposite-connected-road-second-end-reverse', 1, 'thin'],
	['city-opposite-connected-road-second-end-reverse', 1, 'fat'],
	['city-opposite-connected-two-road-ends', 1, 'thin'],
	['city-opposite-connected-two-road-ends', 1, 'fat'],
	['monastery-two-road-ends', 1, 'thin'],
	['monastery-two-road-ends', 1, 'fat'],
	['t-junction', 1, 'thin'],
	['t-junction', 1, 'fat'],
	['t-junction-reverse', 1, 'thin'],
	['t-junction-reverse', 1, 'fat'],
	['city-four-connected', 1, 'thin'],
	['city-four-connected', 1, 'fat'],
	['city-three-connected', 1, 'thin'],
	['city-three-connected', 1, 'fat'],
	['city-three-connected-reverse', 1, 'thin'],
	['city-three-connected-reverse', 1, 'fat'],
	['city-three-road', 1, 'thin'],
	['city-three-road', 1, 'fat'],
	['city-three-road-reverse', 1, 'thin'],
	['city-three-road-reverse', 1, 'fat'],
	['city-opposite-connected', 1, 'thin'],
	['city-opposite-connected', 1, 'fat'],
	['city-opposite-connected-reverse', 1, 'thin'],
	['city-opposite-connected-reverse', 1, 'fat'],
	['city-opposite-separated', 1, 'thin'],
	['city-opposite-separated', 1, 'fat'],
	['city-opposite-separated-reverse', 1, 'thin'],
	['city-opposite-separated-reverse', 1, 'fat'],
	['city-adjacent-connected-c', 1, 'thin'],
	['city-adjacent-connected-c', 1, 'fat'],
	['city-adjacent-connected-v', 1, 'thin'],
	['city-adjacent-connected-v', 1, 'fat'],
	['city-adjacent-curve-road-c', 1, 'thin'],
	['city-adjacent-curve-road-c', 1, 'fat'],
	['city-adjacent-curve-road-v', 1, 'thin'],
	['city-adjacent-curve-road-v', 1, 'fat'],
	['city-adjacent-separated-c', 1, 'thin'],
	['city-adjacent-separated-c', 1, 'fat'],
	['city-adjacent-separated-v', 1, 'thin'],
	['city-adjacent-separated-v', 1, 'fat'],
	['city-one-t-junction', 1, 'thin'],
	['city-one-t-junction', 1, 'fat'],
	['city-one-t-junction-reverse', 1, 'thin'],
	['city-one-t-junction-reverse', 1, 'fat'],
	['cross-junction', 1, 'thin'],
	['cross-junction', 1, 'fat'],
	['monastery-field', 1, 'thin'],
	['monastery-field', 1, 'fat'],
	['monastery-road-end', 1, 'thin'],
	['monastery-road-end', 1, 'fat'],
	['monastery-road-end-reverse', 1, 'thin'],
	['monastery-road-end-reverse', 1, 'fat'],
];

// Standard はタイル一覧（CATALOG）と同じ物理カード構成を使う。
const STANDARD_DEFINITIONS = [
	// ['straight-road', 2, 'thin'],
	// ['straight-road', 2, 'fat'],
	// ['straight-road-reverse', 2, 'thin'],
	// ['straight-road-reverse', 2, 'fat'],
	// ['curve-road-c', 2, 'thin'],
	// ['curve-road-c', 2, 'fat'],
	['curve-road-v', 3, 'thin'],
	['curve-road-v', 3, 'fat'],
	['city-one-side', 2, 'thin'],
	['city-one-side', 2, 'fat'],
	['city-one-side-reverse', 2, 'thin'],
	['city-one-side-reverse', 2, 'fat'],
	// ['city-one-side-straight-road', 1, 'thin'],
	// ['city-one-side-straight-road', 1, 'fat'],
	// ['city-one-side-straight-road-reverse', 1, 'thin'],
	// ['city-one-side-straight-road-reverse', 1, 'fat'],
	// ['city-one-side-curve-road-c', 1, 'thin'],
	// ['city-one-side-curve-road-c', 1, 'fat'],
	['city-one-side-curve-road-v', 2, 'thin'],
	['city-one-side-curve-road-v', 2, 'fat'],
	// ['city-one-side-curve-road-c-reverse', 1, 'thin'],
	// ['city-one-side-curve-road-c-reverse', 1, 'fat'],
	['city-one-side-curve-road-v-reverse', 2, 'thin'],
	['city-one-side-curve-road-v-reverse', 2, 'fat'],
	['city-road-end-c', 2, 'thin'],
	['city-road-end-c', 2, 'fat'],
	['city-road-end-c-reverse', 2, 'thin'],
	['city-road-end-c-reverse', 2, 'fat'],
	// ['city-road-end-v', 1, 'thin'],
	// ['city-road-end-v', 1, 'fat'],
	// ['city-road-end-v-reverse', 1, 'thin'],
	// ['city-road-end-v-reverse', 1, 'fat'],
	// ['t-junction', 1, 'thin'],
	// ['t-junction', 1, 'fat'],
	// ['t-junction-reverse', 1, 'thin'],
	// ['t-junction-reverse', 1, 'fat'],
	// ['city-four-connected', 1, 'thin'],
	// ['city-four-connected', 1, 'fat'],
	// ['city-three-connected', 1, 'thin'],
	// ['city-three-connected', 1, 'fat'],
	// ['city-three-connected-reverse', 1, 'thin'],
	// ['city-three-connected-reverse', 1, 'fat'],
	// ['city-three-road', 1, 'thin'],
	// ['city-three-road', 1, 'fat'],
	// ['city-three-road-reverse', 1, 'thin'],
	// ['city-three-road-reverse', 1, 'fat'],
	// ['city-opposite-connected', 1, 'thin'],
	// ['city-opposite-connected', 1, 'fat'],
	// ['city-opposite-connected-reverse', 1, 'thin'],
	// ['city-opposite-connected-reverse', 1, 'fat'],
	// ['city-opposite-separated', 1, 'thin'],
	// ['city-opposite-separated', 1, 'fat'],
	// ['city-opposite-separated-reverse', 1, 'thin'],
	// ['city-opposite-separated-reverse', 1, 'fat'],
	// ['city-adjacent-connected-c', 1, 'thin'],
	// ['city-adjacent-connected-c', 1, 'fat'],
	['city-adjacent-connected-v', 2, 'thin'],
	['city-adjacent-connected-v', 2, 'fat'],
	// ['city-adjacent-curve-road-c', 1, 'thin'],
	// ['city-adjacent-curve-road-c', 1, 'fat'],
	['city-adjacent-curve-road-v', 2, 'thin'],
	['city-adjacent-curve-road-v', 2, 'fat'],
	// ['city-adjacent-separated-c', 1, 'thin'],
	// ['city-adjacent-separated-c', 1, 'fat'],
	['city-adjacent-separated-v', 2, 'thin'],
	['city-adjacent-separated-v', 2, 'fat'],
	// ['city-one-t-junction', 1, 'thin'],
	// ['city-one-t-junction', 1, 'fat'],
	// ['city-one-t-junction-reverse', 1, 'thin'],
	// ['city-one-t-junction-reverse', 1, 'fat'],
	// ['cross-junction', 1, 'thin'],
	// ['cross-junction', 1, 'fat'],
	['monastery-field', 1, 'thin'],
	['monastery-field', 1, 'fat'],
	['monastery-road-end', 1, 'thin'],
	['monastery-road-end', 1, 'fat'],
	['monastery-road-end-reverse', 1, 'thin'],
	['monastery-road-end-reverse', 1, 'fat'],
	['city-road-end-c', 1, 'thin'],
	['city-road-end-c', 1, 'fat'],
	['city-road-end-c-reverse', 1, 'thin'],
	['city-road-end-c-reverse', 1, 'fat'],
	['city-road-end-v', 1, 'thin'],
	['city-road-end-v', 1, 'fat'],
	['city-road-end-v-reverse', 1, 'thin'],
	['city-road-end-v-reverse', 1, 'fat'],
	['city-one-two-road-ends', 1, 'thin'],
	['city-one-two-road-ends', 1, 'fat'],
	['city-one-two-road-ends-reverse', 1, 'thin'],
	['city-one-two-road-ends-reverse', 1, 'fat'],
	['city-road-end-third', 1, 'thin'],
	['city-road-end-third', 1, 'fat'],
	['city-road-end-third-reverse', 1, 'thin'],
	['city-road-end-third-reverse', 1, 'fat'],
	['city-opposite-separated-curve-road', 1, 'thin'],
	['city-opposite-separated-curve-road', 1, 'fat'],
	['city-opposite-separated-road-second-to-first', 1, 'thin'],
	['city-opposite-separated-road-second-to-first', 1, 'fat'],
	['city-opposite-separated-road-second-to-first-reverse', 1, 'thin'],
	['city-opposite-separated-road-second-to-first-reverse', 1, 'fat'],
	['city-opposite-separated-road-third-to-first', 1, 'thin'],
	['city-opposite-separated-road-third-to-first', 1, 'fat'],
	['city-opposite-separated-road-third-to-first-reverse', 1, 'thin'],
	['city-opposite-separated-road-third-to-first-reverse', 1, 'fat'],
	['city-opposite-separated-two-road-ends', 1, 'thin'],
	['city-opposite-separated-two-road-ends', 1, 'fat'],
	['city-opposite-connected-road-second-end', 1, 'thin'],
	['city-opposite-connected-road-second-end', 1, 'fat'],
	['city-opposite-connected-road-second-end-reverse', 1, 'thin'],
	['city-opposite-connected-road-second-end-reverse', 1, 'fat'],
	['city-opposite-connected-two-road-ends', 1, 'thin'],
	['city-opposite-connected-two-road-ends', 1, 'fat'],
	['monastery-two-road-ends', 1, 'thin'],
	['monastery-two-road-ends', 1, 'fat'],
];

// Lite は短時間用の36枚。シン／ファットを18枚ずつ含む、基本地形中心の構成。
const LITE_DEFINITIONS = [
	// ['curve-road-v', 3, 'thin'],
	// ['curve-road-v', 3, 'fat'],
	// ['city-one-side', 2, 'thin'],
	// ['city-one-side', 2, 'fat'],
	// ['city-one-side-reverse', 2, 'thin'],
	// ['city-one-side-reverse', 2, 'fat'],
	// ['city-one-side-curve-road-v', 2, 'thin'],
	// ['city-one-side-curve-road-v', 2, 'fat'],
	// ['city-one-side-curve-road-v-reverse', 2, 'thin'],
	// ['city-one-side-curve-road-v-reverse', 2, 'fat'],
	// ['city-road-end-c', 2, 'thin'],
	// ['city-road-end-c', 2, 'fat'],
	// ['city-road-end-c-reverse', 2, 'thin'],
	// ['city-road-end-c-reverse', 2, 'fat'],
	// ['city-adjacent-connected-v', 2, 'thin'],
	// ['city-adjacent-connected-v', 2, 'fat'],
	['city-adjacent-curve-road-v', 3, 'thin'],
	['city-adjacent-curve-road-v', 5, 'fat'],
	// ['city-adjacent-separated-v', 2, 'thin'],
	// ['city-adjacent-separated-v', 2, 'fat'],
	// ['monastery-field', 1, 'thin'],
	// ['monastery-field', 1, 'fat'],
	// ['monastery-road-end', 1, 'thin'],
	// ['monastery-road-end', 1, 'fat'],
	// ['monastery-road-end-reverse', 1, 'thin'],
	// ['monastery-road-end-reverse', 1, 'fat'],
	// ['city-road-end-c', 1, 'thin'],
	// ['city-road-end-c', 1, 'fat'],
	// ['city-road-end-c-reverse', 1, 'thin'],
	// ['city-road-end-c-reverse', 1, 'fat'],
	// ['city-road-end-v', 1, 'thin'],
	// ['city-road-end-v', 1, 'fat'],
	// ['city-road-end-v-reverse', 1, 'thin'],
	// ['city-road-end-v-reverse', 1, 'fat'],
	// ['city-one-two-road-ends', 1, 'thin'],
	// ['city-one-two-road-ends', 1, 'fat'],
	// ['city-one-two-road-ends-reverse', 1, 'thin'],
	// ['city-one-two-road-ends-reverse', 1, 'fat'],
	// ['city-road-end-third', 1, 'thin'],
	// ['city-road-end-third', 1, 'fat'],
	// ['city-road-end-third-reverse', 1, 'thin'],
	// ['city-road-end-third-reverse', 1, 'fat'],
	['city-opposite-separated-curve-road', 3, 'thin'],
	['city-opposite-separated-curve-road', 5, 'fat'],
	// ['city-opposite-separated-road-second-to-first', 1, 'thin'],
	// ['city-opposite-separated-road-second-to-first', 1, 'fat'],
	// ['city-opposite-separated-road-second-to-first-reverse', 1, 'thin'],
	// ['city-opposite-separated-road-second-to-first-reverse', 1, 'fat'],
	// ['city-opposite-separated-road-third-to-first', 1, 'thin'],
	// ['city-opposite-separated-road-third-to-first', 1, 'fat'],
	// ['city-opposite-separated-road-third-to-first-reverse', 1, 'thin'],
	// ['city-opposite-separated-road-third-to-first-reverse', 1, 'fat'],
	['city-opposite-separated-two-road-ends', 3, 'thin'],
	['city-opposite-separated-two-road-ends', 5, 'fat'],
	// ['city-opposite-connected-road-second-end', 1, 'thin'],
	// ['city-opposite-connected-road-second-end', 1, 'fat'],
	// ['city-opposite-connected-road-second-end-reverse', 1, 'thin'],
	// ['city-opposite-connected-road-second-end-reverse', 1, 'fat'],
	['city-opposite-connected-two-road-ends', 3, 'thin'],
	['city-opposite-connected-two-road-ends', 5, 'fat'],
	// ['monastery-two-road-ends', 1, 'thin'],
	// ['monastery-two-road-ends', 1, 'fat'],
];

// 道だけデッキ: 道系は各3枚、交差点は各2枚、修道院は各1枚。
// どの種類もシン／ファットを同数含めるため、計42枚（各形状21枚）になる。
const ROAD_ONLY_DEFINITIONS = [
	['straight-road', 3, 'thin'],
	['straight-road', 5, 'fat'],
	['straight-road-reverse', 3, 'thin'],
	['straight-road-reverse', 5, 'fat'],
	['curve-road-c', 3, 'thin'],
	['curve-road-c', 5, 'fat'],
	['curve-road-v', 3, 'thin'],
	['curve-road-v', 5, 'fat'],
	['t-junction', 2, 'thin'],
	['t-junction', 3, 'fat'],
	['t-junction-reverse', 2, 'thin'],
	['t-junction-reverse', 3, 'fat'],
	['cross-junction', 2, 'thin'],
	['cross-junction', 3, 'fat'],
	['monastery-field', 1, 'thin'],
	['monastery-field', 1, 'fat'],
	['monastery-road-end', 1, 'thin'],
	['monastery-road-end', 1, 'fat'],
	['monastery-road-end-reverse', 1, 'thin'],
	['monastery-road-end-reverse', 1, 'fat'],
];

export const TILE_DECK_TYPES = Object.freeze({
	lite: 'lite',
	standard: 'standard',
	roadOnly: 'road-only',
});
export const DECK_CONFIGS = Object.freeze([
	{ id: 'lite', label: 'Lite', description: '36枚・短時間向け' },
	{ id: 'standard', label: 'Standard', description: '90枚・暫定基本セット' },
	{ id: 'road-only', label: '道だけ', description: '42枚・道／交差点／修道院のみ' },
]);
const DECK_DEFINITIONS = Object.freeze({
	lite: LITE_DEFINITIONS,
	standard: STANDARD_DEFINITIONS,
	'road-only': ROAD_ONLY_DEFINITIONS,
});

function definitionsFor(deckType) {
	const definitions = DECK_DEFINITIONS[deckType];
	if (!definitions) throw new Error(`Unknown deck type: ${deckType}`);
	return definitions;
}

export function createPrototypeDeck(random = Math.random, deckType = 'standard') {
	if (typeof random === 'string') [deckType, random] = [random, Math.random];
	let serial = 0;
	return definitionsFor(deckType).flatMap(([idPrefix, count, shape]) =>
		Array.from({ length: count }, () => {
			const definition = dataFor(shape, idPrefix),
				fieldScoreGroups = scoreFieldGroupsFor(idPrefix, definition);
			return createTile(
				{
					idPrefix,
					count,
					shape,
					hasCrest: false,
					hasMonastery: false,
					...definition,
					featureAnchors: explicitAnchorsFor(shape, idPrefix),
					fieldScoreGroups,
					fieldScoreCityAdjacency: scoreFieldCityAdjacency(shape, definition, fieldScoreGroups),
				},
				`${shape}-${idPrefix}-${String(++serial).padStart(3, '0')}`,
				random() >= 0.5,
			);
		}),
	);
}

// デバッグ用。Lite / Standard の採用状況にかかわらず、手動アンカーを持つ全種別を返す。
export function createTileCatalog(random = Math.random) {
	let serial = 0;
	return CATALOG_DEFINITIONS.flatMap(([idPrefix, count, shape]) =>
		Array.from({ length: count }, () => {
			const definition = dataFor(shape, idPrefix),
				fieldScoreGroups = scoreFieldGroupsFor(idPrefix, definition);
			return createTile(
				{
					idPrefix,
					count,
					shape,
					hasCrest: false,
					hasMonastery: false,
					...definition,
					featureAnchors: explicitAnchorsFor(shape, idPrefix),
					fieldScoreGroups,
					fieldScoreCityAdjacency: scoreFieldCityAdjacency(shape, definition, fieldScoreGroups),
				},
				`${shape}-${idPrefix}-catalog-${String(++serial).padStart(3, '0')}`,
				random() >= 0.5,
			);
		}),
	);
}

export function manualAnchorOrder(tile) {
	return [...MANUAL_FEATURE_ANCHORS.keys()].indexOf(`${tile.shape}:${tile.idPrefix}`);
}

// 左右反転は、辺を first ⇄ fourth / second ⇄ third、頂点側の小領域を
// ① ⇄ ① / ② ⇄ ④ / ③ ⇄ ③ と対応させる。タイルのローカル座標では x を反転する。
export function mirrorTile(tile) {
	const mirrored = structuredClone(tile);
	const names = edgeNames(tile.shape),
		edgeMap = Object.fromEntries(names.map((name, index) => [name, names[3 - index]]));
	const subregionMap = { 1: 1, 2: 4, 3: 3, 4: 2 };
	const mapEdges = (edges = []) => edges.map((edge) => edgeMap[edge] || edge);
	const mapGroup = (group) =>
		Array.isArray(group)
			? mapEdges(group)
			: {
					...group,
					boundaryEdges: mapEdges(group.boundaryEdges),
					anchor: group.anchor ? { ...group.anchor, x: -group.anchor.x } : group.anchor,
				};

	mirrored.edgeTerrain = Object.fromEntries(
		names.map((name) => [edgeMap[name], tile.edgeTerrain[name]]),
	);
	mirrored.featureGroups = Object.fromEntries(
		Object.entries(tile.featureGroups || {}).map(([type, groups]) => [type, groups.map(mapGroup)]),
	);
	mirrored.featureAnchors = Object.fromEntries(
		Object.entries(tile.featureAnchors || {}).map(([type, anchors]) => [
			type,
			anchors.map((anchor) => (anchor ? { ...anchor, x: -anchor.x } : anchor)),
		]),
	);
	mirrored.roadTerminals = Object.fromEntries(
		Object.entries(tile.roadTerminals || {}).map(([index, terminals]) => [
			index,
			terminals.map((terminal) =>
				terminal.edge ? { ...terminal, edge: edgeMap[terminal.edge] } : { ...terminal },
			),
		]),
	);
	mirrored.fieldScoreGroups = (tile.fieldScoreGroups || []).map((group) =>
		group.map((subregion) => subregionMap[subregion]),
	);
	mirrored.fieldScoreCityAdjacency = scoreFieldCityAdjacency(
		tile.shape,
		mirrored,
		mirrored.fieldScoreGroups,
	);
	mirrored.fieldCityAdjacency = structuredClone(tile.fieldCityAdjacency || {});
	mirrored.mirrored = !tile.mirrored;
	mirrored.originalId = tile.originalId || tile.id;
	mirrored.id = mirrored.mirrored ? `${mirrored.originalId}-mirror` : mirrored.originalId;
	mirrored.idPrefix = mirrored.mirrored
		? `${tile.idPrefix.replace(/-mirror$/, '')}-mirror`
		: tile.idPrefix.replace(/-mirror$/, '');
	return mirrored;
}

// ミラー版はデッキへ加えない。反転アクションと空白防止の候補だけが利用する。
export function createPrototypeMirrorTiles(random = Math.random, deckType = 'standard') {
	return createPrototypeDeck(random, deckType).map((tile) => mirrorTile(tile));
}
